import type OpenAI from "openai";
import { createGroqClient, groqModel } from "@/lib/ai/groq";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertAgentChatRateLimit } from "@/server/rate-limit";
import { executeMcpTool, openaiTools } from "@/server/mcp/tools";

const SYSTEM_PROMPT = `Você é o agente de estudo da plataforma IA Estudar.
Ajuda o usuário a organizar pastas, documentos, cronogramas e formulários de prática.

Regras:
- Use as ferramentas MCP disponíveis; nunca invente IDs.
- Nunca sobrescreva conteúdo existente sem confirmação explícita do usuário.
- Fluxo ideal numa única tarefa: create_folder → create_document (com initialContent ≥50 chars) → generate_schedule (confirmed=false depois true) → generate_form (confirmed=false depois true).
- Se o documento nascer vazio, use update_document com contentText antes de generate_form.
- Para generate_schedule, generate_form e update_document (quando há conteúdo): primeiro confirmed=false, explique o preview; só persista com confirmed=true após o usuário confirmar (a UI também pode confirmar).
- Se faltar contexto (tópicos, documento vazio, data), peça — não invente.
- Responda em português brasileiro, de forma direta.
- userId já está no contexto autenticado; nunca peça nem aceite userId do usuário.`;

type StreamEvent =
  | { type: "textDelta"; textDelta: string }
  | {
      type: "toolCall";
      toolCall: {
        name: string;
        input: unknown;
        status: "pending_confirmation" | "executed" | "error";
        result?: unknown;
        error?: string;
      };
    }
  | { type: "conversation"; conversationId: string }
  | { type: "done" }
  | { type: "error"; message: string };

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

type ConfirmTool = {
  name: "generate_schedule" | "generate_form" | "update_document";
  input: Record<string, unknown>;
};

export async function* runAgentChat(opts: {
  userId: string;
  message?: string;
  conversationId?: string;
  confirmTool?: ConfirmTool;
}): AsyncGenerator<StreamEvent> {
  assertAgentChatRateLimit(opts.userId);

  if (!process.env.GROQ_API_KEY) {
    throw new AppError(
      "GROQ_API_KEY não configurada",
      500,
      "AI_NOT_CONFIGURED",
    );
  }

  const db = await createDbClient();
  let conversationId = opts.conversationId;

  if (!conversationId) {
    const { data, error } = await db
      .from("conversations")
      .insert({ user_id: opts.userId })
      .select("id")
      .single();
    if (error || !data) {
      throw new AppError("Falha ao criar conversa", 500, "CONVERSATION");
    }
    conversationId = data.id as string;
  } else {
    const { data } = await db
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    if (!data) {
      throw new AppError("Conversa não encontrada", 404, "CONVERSATION");
    }
  }

  yield { type: "conversation", conversationId };

  if (opts.confirmTool) {
    const confirmedInput = { ...opts.confirmTool.input, confirmed: true };
    const userLine = `Confirmei a ferramenta ${opts.confirmTool.name}.`;

    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      user_id: opts.userId,
      role: "user",
      content: userLine,
    });

    const result = await executeMcpTool(
      { userId: opts.userId },
      opts.confirmTool.name,
      confirmedInput,
    );

    const status =
      result.status === "pending_confirmation"
        ? "pending_confirmation"
        : result.status === "error"
          ? "error"
          : "executed";

    yield {
      type: "toolCall",
      toolCall: {
        name: opts.confirmTool.name,
        input: confirmedInput,
        status,
        result: result.data,
        error: result.error,
      },
    };

    const summary =
      status === "executed"
        ? `Pronto — ${opts.confirmTool.name} executada com sucesso.`
        : status === "error"
          ? `Não consegui confirmar: ${result.error ?? "erro"}`
          : "Ainda preciso de confirmação.";

    yield { type: "textDelta", textDelta: summary };

    await db.from("conversation_messages").insert({
      conversation_id: conversationId,
      user_id: opts.userId,
      role: "assistant",
      content: summary,
    });

    yield { type: "done" };
    return;
  }

  const message = opts.message?.trim() ?? "";
  if (!message) {
    throw new AppError("Mensagem vazia", 400, "EMPTY_MESSAGE");
  }

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "user",
    content: message,
  });

  const { data: history } = await db
    .from("conversation_messages")
    .select("role, content, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const messages: ChatMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  for (const row of history ?? []) {
    if (row.role === "user" || row.role === "assistant") {
      messages.push({
        role: row.role,
        content: row.content || "(vazio)",
      });
    }
  }

  const client = createGroqClient();
  const tools = openaiTools();
  const model = groqModel();

  let assistantText = "";
  let turns = 0;

  while (turns < 6) {
    turns += 1;

    const stream = await client.chat.completions.create({
      model,
      max_tokens: 4096,
      messages,
      tools,
      stream: true,
    });

    const toolCallsByIndex = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();

    for await (const chunk of stream) {
      const choice = chunk.choices[0];
      if (!choice) continue;

      const delta = choice.delta;
      if (delta.content) {
        assistantText += delta.content;
        yield { type: "textDelta", textDelta: delta.content };
      }

      if (delta.tool_calls) {
        for (const part of delta.tool_calls) {
          const existing = toolCallsByIndex.get(part.index) ?? {
            id: "",
            name: "",
            arguments: "",
          };
          if (part.id) existing.id = part.id;
          if (part.function?.name) existing.name = part.function.name;
          if (part.function?.arguments) {
            existing.arguments += part.function.arguments;
          }
          toolCallsByIndex.set(part.index, existing);
        }
      }
    }

    const toolCalls = [...toolCallsByIndex.entries()]
      .sort(([a], [b]) => a - b)
      .map(([, call]) => call)
      .filter((call) => call.name);

    if (toolCalls.length === 0) {
      break;
    }

    messages.push({
      role: "assistant",
      content: null,
      tool_calls: toolCalls.map((call) => ({
        id: call.id,
        type: "function" as const,
        function: {
          name: call.name,
          arguments: call.arguments || "{}",
        },
      })),
    });

    let hasPending = false;

    for (const call of toolCalls) {
      let parsedInput: unknown = {};
      try {
        parsedInput = JSON.parse(call.arguments || "{}");
      } catch {
        parsedInput = {};
      }

      const result = await executeMcpTool(
        { userId: opts.userId },
        call.name,
        parsedInput,
      );

      const status =
        result.status === "pending_confirmation"
          ? "pending_confirmation"
          : result.status === "error"
            ? "error"
            : "executed";

      if (status === "pending_confirmation") {
        hasPending = true;
      }

      yield {
        type: "toolCall",
        toolCall: {
          name: call.name,
          input: parsedInput,
          status,
          result: result.data,
          error: result.error,
        },
      };

      messages.push({
        role: "tool",
        tool_call_id: call.id,
        content: JSON.stringify(result),
      });
    }

    if (hasPending) {
      const follow = await client.chat.completions.create({
        model,
        max_tokens: 1024,
        messages,
        tools,
        stream: true,
      });

      for await (const chunk of follow) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          assistantText += text;
          yield { type: "textDelta", textDelta: text };
        }
      }
      break;
    }
  }

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "assistant",
    content: assistantText,
  });

  yield { type: "done" };
}

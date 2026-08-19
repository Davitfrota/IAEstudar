import Anthropic from "@anthropic-ai/sdk";
import { createAdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import {
  historyToAnthropicMessages,
  type PersistedToolCall,
} from "@/server/mcp/agent-history";
import { assertAgentChatRateLimit } from "@/server/rate-limit";
import { anthropicTools, executeMcpTool } from "@/server/mcp/tools";

const SYSTEM_PROMPT = `Você é o agente de estudo da plataforma IA Estudar.
Ajuda o usuário a organizar pastas, documentos, cronogramas e formulários de prática.

Regras:
- Use as ferramentas MCP disponíveis; nunca invente IDs.
- Nunca sobrescreva conteúdo existente sem confirmação explícita do usuário.
- Para generate_schedule e generate_form: primeiro chame com confirmed=false, explique o preview, e só persista com confirmed=true após o usuário confirmar.
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

export async function* runAgentChat(opts: {
  userId: string;
  message: string;
  conversationId?: string;
}): AsyncGenerator<StreamEvent> {
  assertAgentChatRateLimit(opts.userId);

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new AppError(
      "ANTHROPIC_API_KEY não configurada",
      500,
      "AI_NOT_CONFIGURED",
    );
  }

  const db = createAdminClient();
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

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "user",
    content: opts.message,
  });

  const { data: history } = await db
    .from("conversation_messages")
    .select("role, content, tool_calls")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  const messages = historyToAnthropicMessages(history ?? []);

  const client = new Anthropic({ apiKey });
  const tools = anthropicTools() as Anthropic.Tool[];

  let assistantText = "";
  let turns = 0;
  const persistedTools: PersistedToolCall[] = [];

  while (turns < 6) {
    turns += 1;

    const stream = client.messages.stream({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools,
      messages,
    });

    for await (const event of stream) {
      if (
        event.type === "content_block_delta" &&
        event.delta.type === "text_delta"
      ) {
        assistantText += event.delta.text;
        yield { type: "textDelta", textDelta: event.delta.text };
      }
    }

    const final = await stream.finalMessage();
    const toolUses = final.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (toolUses.length === 0) {
      break;
    }

    messages.push({ role: "assistant", content: final.content });

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const tool of toolUses) {
      const result = await executeMcpTool(
        { userId: opts.userId },
        tool.name,
        tool.input,
      );

      const status =
        result.status === "pending_confirmation"
          ? "pending_confirmation"
          : result.status === "error"
            ? "error"
            : "executed";

      persistedTools.push({
        id: tool.id,
        name: tool.name,
        input: tool.input,
        status,
        result: result.data,
        error: result.error,
      });

      yield {
        type: "toolCall",
        toolCall: {
          name: tool.name,
          input: tool.input,
          status,
          result: result.data,
          error: result.error,
        },
      };

      toolResults.push({
        type: "tool_result",
        tool_use_id: tool.id,
        content: JSON.stringify(result),
        is_error: result.status === "error",
      });
    }

    messages.push({ role: "user", content: toolResults });

    const pending = toolUses.some((_, i) => {
      const parsed = JSON.parse(
        (toolResults[i].content as string) || "{}",
      ) as { status?: string };
      return parsed.status === "pending_confirmation";
    });

    if (pending) {
      // Deixa o modelo explicar o preview e aguardar confirmação do usuário
      const follow = client.messages.stream({
        model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools,
        messages,
      });

      for await (const event of follow) {
        if (
          event.type === "content_block_delta" &&
          event.delta.type === "text_delta"
        ) {
          assistantText += event.delta.text;
          yield { type: "textDelta", textDelta: event.delta.text };
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
    tool_calls: persistedTools.length > 0 ? persistedTools : null,
  });

  yield { type: "done" };
}

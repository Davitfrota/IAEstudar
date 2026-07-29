import type OpenAI from "openai";
import { createGroqClient, groqModel } from "@/lib/ai/groq";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertAgentChatRateLimit } from "@/server/rate-limit";
import { executeMcpTool, openaiTools } from "@/server/mcp/tools";
import { FormService } from "@/server/services/form-service";
import {
  PLANABLE_TOOLS,
  createPendingPlan,
  describeToolStep,
  summarizePlan,
  toToolPlanPreview,
  type ToolPlanPreview,
} from "@/server/pending-plans";

const SYSTEM_PROMPT = `Você é o agente de estudo da plataforma IA Estudar.
Ajuda o usuário a organizar pastas, documentos, cronogramas e formulários de prática.

Regras:
- Use as ferramentas MCP disponíveis; nunca invente IDs.
- Para criar conteúdo (create_folder, create_document, update_document, generate_schedule, generate_form), chame TODAS as ferramentas necessárias na mesma resposta — o sistema agrupa num plano único para o usuário confirmar uma vez.
- Não peça confirmed=true você mesmo; a UI confirma o plano.
- Prefira create_document com initialContent ≥50 chars se for gerar formulário em seguida.
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
  | { type: "toolPlan"; toolPlan: ToolPlanPreview }
  | { type: "conversation"; conversationId: string }
  | { type: "done" }
  | { type: "error"; message: string };

type ChatMessage = OpenAI.Chat.ChatCompletionMessageParam;

export async function* runAgentChat(opts: {
  userId: string;
  message: string;
  conversationId?: string;
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

  const message = opts.message.trim();
  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "user",
    content: message,
  });

  const { data: history } = await db
    .from("conversation_messages")
    .select("role, content")
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

    if (toolCalls.length === 0) break;

    const parsedCalls = toolCalls.map((call) => {
      let input: Record<string, unknown> = {};
      try {
        input = JSON.parse(call.arguments || "{}") as Record<string, unknown>;
      } catch {
        input = {};
      }
      return { ...call, input };
    });

    const planable = parsedCalls.filter((c) => PLANABLE_TOOLS.has(c.name));
    const immediate = parsedCalls.filter((c) => !PLANABLE_TOOLS.has(c.name));

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

    for (const call of immediate) {
      const result = await executeMcpTool(
        { userId: opts.userId },
        call.name,
        call.input,
      );
      const status =
        result.status === "error"
          ? "error"
          : result.status === "pending_confirmation"
            ? "pending_confirmation"
            : "executed";

      yield {
        type: "toolCall",
        toolCall: {
          name: call.name,
          input: call.input,
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

    if (planable.length > 0) {
      let estimatedCost: ToolPlanPreview["estimatedCost"];
      let draftQuestions: ToolPlanPreview["draftQuestions"];

      const steps = [];
      for (const call of planable) {
        const input = { ...call.input };
        // Preview de form: gera rascunho agora (custa rate limit / IA), persistência só no confirm
        if (call.name === "generate_form") {
          try {
            const preview = await new FormService().previewGenerate(
              opts.userId,
              {
                sourceDocumentId: String(input.sourceDocumentId),
                type: input.type as "flashcard_deck" | "quiz" | "open_form",
                instruction: String(input.instruction ?? ""),
                questionCount: Number(input.questionCount ?? 10),
                confirmed: false,
              },
            );
            draftQuestions = preview.preview.questions;
            estimatedCost = preview.preview.estimate;
            input.questions = draftQuestions;
          } catch (error) {
            const msg =
              error instanceof Error ? error.message : "Falha no preview";
            messages.push({
              role: "tool",
              tool_call_id: call.id,
              content: JSON.stringify({ status: "error", error: msg }),
            });
            yield {
              type: "toolCall",
              toolCall: {
                name: call.name,
                input,
                status: "error",
                error: msg,
              },
            };
            continue;
          }
        }

        steps.push({
          tool: call.name,
          description: describeToolStep(call.name, input),
          input,
        });

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            status: "pending_confirmation",
            message: "Aguardando confirmação do plano consolidado na UI",
          }),
        });
      }

      if (steps.length > 0) {
        const plan = await createPendingPlan({
          userId: opts.userId,
          summary: summarizePlan(steps),
          steps,
          estimatedCost,
          draftQuestions,
        });

        yield {
          type: "toolPlan",
          toolPlan: toToolPlanPreview(plan, "awaiting_confirmation"),
        };

        const follow = await client.chat.completions.create({
          model,
          max_tokens: 512,
          messages: [
            ...messages,
            {
              role: "user",
              content:
                "Explique em 2–3 frases o plano proposto e peça para o usuário confirmar ou pedir ajustes na UI.",
            },
          ],
          stream: true,
        });

        for await (const chunk of follow) {
          const text = chunk.choices[0]?.delta?.content;
          if (text) {
            assistantText += text;
            yield { type: "textDelta", textDelta: text };
          }
        }
      }

      break;
    }

    if (immediate.length === 0) break;
  }

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "assistant",
    content: assistantText,
  });

  yield { type: "done" };
}

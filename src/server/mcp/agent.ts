import type OpenAI from "openai";
import { createGroqClient, groqModel } from "@/lib/ai/groq";
import { groqToolCompletion } from "@/lib/ai/groq-tools";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertAgentChatRateLimit } from "@/server/rate-limit";
import { executeMcpTool, openaiTools } from "@/server/mcp/tools";
import { FormService } from "@/server/services/form-service";
import {
  PLANABLE_TOOLS,
  createPendingPlan,
  expandToPlanSteps,
  summarizePlan,
  toToolPlanPreview,
  type ToolPlanPreview,
} from "@/server/pending-plans";

const SYSTEM_PROMPT = `Você é o agente de estudo da plataforma IA Estudar.
Ajuda o usuário a organizar pastas, documentos, cronogramas e formulários de prática.

Regras:
- Use as ferramentas MCP disponíveis; nunca invente IDs.
- Se o usuário pedir setup completo (pasta + documento + cronograma e/ou flashcards), chame UMA ÚNICA ferramenta: propose_study_plan — não chame create_folder/create_document/generate_* em paralelo.
- Estrutura da pasta em propose_study_plan:
  1) Pasta com o nome do tema
  2) documentTitle/documentContent = RESUMO do tema inteiro (≥50 chars, conteúdo útil)
  3) organizationMode: "by_topic" (default — um arquivo por tópico) OU "by_day" (um arquivo por dia até targetDate) conforme o usuário pedir
  4) lessonNotes: preencha título+conteúdo (≥50 chars cada) para cada arquivo extra — não deixe vazio genérico
  5) Cronograma até targetDate cobrindo TODOS os dias (o sistema preenche o intervalo)
  6) Flashcards a partir do resumo, se pedido
- Cronograma bem feito: topics claros e progressivos (ex.: limites → derivadas → regra da cadeia → revisão); dailyMinutes realista (25–60); targetDate YYYY-MM-DD futuro (ano corrente se omitido).
- Para ações pontuais (só pasta, só doc, só agenda, só form em doc existente), use a tool correspondente.
- Não peça confirmed=true você mesmo; a UI confirma o plano.
- Se faltar contexto, peça — não invente.
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
  await assertAgentChatRateLimit(opts.userId);

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

    let content = "";
    let toolCalls: Awaited<
      ReturnType<typeof groqToolCompletion>
    >["toolCalls"] = [];

    try {
      const result = await groqToolCompletion({
        client,
        model,
        messages,
        tools,
      });
      content = result.content;
      toolCalls = result.toolCalls;
    } catch (error) {
      const msg =
        error instanceof AppError
          ? error.message
          : error instanceof Error
            ? error.message
            : "Falha no Groq";
      yield { type: "error", message: msg };
      assistantText += msg;
      break;
    }

    if (content) {
      assistantText += content;
      yield { type: "textDelta", textDelta: content };
    }

    if (toolCalls.length === 0) break;

    const planable = toolCalls.filter((c) => PLANABLE_TOOLS.has(c.name));
    const immediate = toolCalls.filter((c) => !PLANABLE_TOOLS.has(c.name));

    messages.push({
      role: "assistant",
      content: content || null,
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
      const steps: {
        tool: string;
        description: string;
        input: Record<string, unknown>;
      }[] = [];

      for (const call of planable) {
        const expanded = expandToPlanSteps(call.name, call.input);

        for (const step of expanded) {
          if (step.tool === "generate_form" && !step.input._deferredPreview) {
            try {
              const preview = await new FormService().previewGenerate(
                opts.userId,
                {
                  sourceDocumentId: String(step.input.sourceDocumentId),
                  type: step.input.type as
                    | "flashcard_deck"
                    | "quiz"
                    | "open_form",
                  instruction: String(step.input.instruction ?? ""),
                  questionCount: Number(step.input.questionCount ?? 10),
                  confirmed: false,
                },
              );
              draftQuestions = preview.preview.questions;
              estimatedCost = preview.preview.estimate;
              step.input.questions = draftQuestions;
            } catch {
              step.input._deferredPreview = true;
            }
          }
          steps.push(step);
        }

        messages.push({
          role: "tool",
          tool_call_id: call.id,
          content: JSON.stringify({
            status: "pending_confirmation",
            message: "Aguardando confirmação do plano consolidado na UI",
            steps: steps.map((s) => s.tool),
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
          temperature: 0.3,
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

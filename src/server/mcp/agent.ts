import type OpenAI from "openai";
import { createGroqClient, groqModel } from "@/lib/ai/groq";
import {
  groqToolCompletion,
  hasPlanRequirementsInHistory,
} from "@/lib/ai/groq-tools";
import { createDbClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import { assertAgentChatRateLimit } from "@/server/rate-limit";
import { executeMcpTool, openaiTools } from "@/server/mcp/tools";
import { FormService } from "@/server/services/form-service";
import { ConversationService } from "@/server/services/conversation-service";
import {
  PLANABLE_TOOLS,
  createPendingPlan,
  expandToPlanSteps,
  summarizePlan,
  toToolPlanPreview,
  type ToolPlanPreview,
} from "@/server/pending-plans";

const SYSTEM_PROMPT = `Você é Nara, professora particular do estudante na plataforma IA Estudar.
Seu papel não é responder perguntas soltas — é conduzir um programa de estudos do início ao fim.

TOM: direto, encorajador, mas cobra prazo — como uma professora que se importa com o progresso, não um chatbot de suporte. Português brasileiro.

COMPORTAMENTO:
- Ao criar um plano novo, sempre pergunte objetivo, prazo e nível atual antes de gerar (não assuma).
- Na mensagem em que você ainda está fazendo essas perguntas: NÃO chame nenhuma ferramenta de criação (propose_study_plan, create_*, generate_*). Só texto.
- Só chame propose_study_plan DEPOIS que o aluno responder objetivo, prazo e nível.
- Nunca escreva tags tipo <function=...> ou JSON de tool no texto da resposta — as tools vão só pela API.
- Depois de propor um plano, explique o raciocínio da divisão (por que esses dias, essa ordem de tópicos).
- Em conversas vinculadas a um cronograma, você é a tutora DAQUELE plano: comece verificando o que estava previsto para ontem/hoje antes de qualquer outra coisa.
- Se o aluno não completou o item de ontem, não ignore — pergunte o motivo (dificuldade, falta de tempo, tópico confuso) antes de seguir.
- Se houver revisões vencidas (use list_due), avise no início da conversa, mesmo que o aluno não pergunte.
- Seja proativa: sugira ajuste de cronograma quando perceber atraso recorrente (2+ dias seguidos), mesmo sem tool de reajuste em lote — proponha o novo calendário manualmente e explique que a alteração será feita quando confirmada na UI.
- Feche cada sessão de acompanhamento com um resumo curto: o que foi visto, o que ficou pendente, o que vem a seguir.

TÍTULO DA CONVERSA:
- Só use a linha Título quando for propor/confirmar o tema do plano (não na fase só de perguntas).
- Formato da primeira linha: Título: <nome curto do plano>
  Ex.: "Título: Cálculo — prova 15/08". Sem markdown nessa linha. Depois continue normalmente.

MARKDOWN:
- Depois da linha Título (se houver), escreva o resto em Markdown claro e legível.
- Use: **negrito** para ênfase, listas numeradas/com marcadores, ### subtítulos curtos, \`código\` só quando útil, e tabelas só se ajudarem.
- Prefira listas para perguntas (objetivo / prazo / nível) e para resumos de sessão.
- Não use HTML cru nem imagens.

FERRAMENTAS:
- Use as ferramentas MCP disponíveis; nunca invente IDs.
- Setup completo (pasta + documento + cronograma e/ou flashcards): UMA ÚNICA ferramenta propose_study_plan — não chame create_folder/create_document/generate_* em paralelo.
- Estrutura em propose_study_plan (organizationMode by_topic, default):
  1) Pasta raiz do tema
  2) Resumo geral do curso
  3) Uma subpasta por tópico
  4) Sessões (plano do dia) dentro de cada tópico — 1 arquivo por dia até targetDate, round-robin nos tópicos
  5) Cronograma cobrindo todos os dias
  6) Flashcards do resumo + formulário/quiz do dia por sessão (quando includeForm)
- organizationMode by_day: pasta "Sessões" com um plano por dia
- Em lessonNotes: cada item precisa de conteúdo DIDÁTICO longo (≥400 caracteres): definição, mecanismo, exemplo, erro comum — não uma frase sola. O sistema monta a página da sessão em cima disso.
- Em documentContent: resumo GERAL do curso completo e condensado (≥500 caracteres), cobrindo todos os tópicos.
- Cronograma bem feito: tópicos progressivos; dailyMinutes 25–60; targetDate YYYY-MM-DD futuro.
- Ações pontuais: use create_folder, create_document, update_document, generate_schedule ou generate_form.
- Não peça confirmed=true você mesma; a UI confirma o plano.
- Se faltar contexto, pergunte — não invente.
- userId já está autenticado; nunca peça nem aceite userId do aluno.`;

/** Extrai "Título: ..." da primeira linha da resposta do assistente. */
export function extractConversationTitle(text: string): string | null {
  const match = text.match(/^\s*T[ií]tulo\s*:\s*(.+)$/im);
  if (!match?.[1]) return null;
  const title = match[1].trim().replace(/^["“']|["”']$/g, "").slice(0, 120);
  return title.length >= 2 ? title : null;
}

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
  | { type: "conversationTitle"; title: string }
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

  const conversations = new ConversationService();
  let scheduleId: string | null = null;

  if (!conversationId) {
    const { data, error } = await db
      .from("conversations")
      .insert({ user_id: opts.userId })
      .select("id, schedule_id")
      .single();
    if (error || !data) {
      throw new AppError("Falha ao criar conversa", 500, "CONVERSATION");
    }
    conversationId = data.id as string;
    scheduleId = (data.schedule_id as string | null) ?? null;
  } else {
    const { data } = await db
      .from("conversations")
      .select("id, schedule_id, title")
      .eq("id", conversationId)
      .eq("user_id", opts.userId)
      .maybeSingle();
    if (!data) {
      throw new AppError("Conversa não encontrada", 404, "CONVERSATION");
    }
    scheduleId = (data.schedule_id as string | null) ?? null;
  }

  yield { type: "conversation", conversationId };

  const message = opts.message.trim();
  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "user",
    content: message,
  });

  await db
    .from("conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("user_id", opts.userId);

  const { data: history } = await db
    .from("conversation_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40);

  let systemContent = SYSTEM_PROMPT;
  if (scheduleId) {
    const ctx = await conversations.getScheduleContext(
      opts.userId,
      scheduleId,
    );
    if (ctx) systemContent = `${SYSTEM_PROMPT}\n\n## Contexto deste chat\n${ctx}`;

    // Injeta revisões vencidas no 1º turno com cronograma (não só via prompt)
    try {
      const due = await executeMcpTool({ userId: opts.userId }, "list_due", {
        limit: 8,
      });
      if (due.status === "success" && due.data) {
        systemContent += `\n\n## Revisões vencidas (list_due)\n${JSON.stringify(due.data).slice(0, 2000)}`;
      }
    } catch {
      // ignore
    }
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemContent },
  ];

  for (const row of history ?? []) {
    if (row.role === "user" || row.role === "assistant") {
      messages.push({
        role: row.role,
        content: row.content || "(vazio)",
      });
    }
  }

  const historyComplete = hasPlanRequirementsInHistory(
    (history ?? [])
      .filter((r) => r.role === "user" || r.role === "assistant")
      .map((r) => ({
        role: String(r.role),
        content: String(r.content ?? ""),
      })),
  );

  const client = createGroqClient();
  const tools = openaiTools();
  const model = groqModel();

  let assistantText = "";
  let turns = 0;
  let proposedPlan = false;

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
        historyComplete,
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
    if (planable.some((c) => c.name === "propose_study_plan")) {
      proposedPlan = true;
    }

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
          if (
            step.tool === "generate_form" &&
            !step.input._deferredPreview &&
            step.input._formRole !== "daily"
          ) {
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
          conversationId,
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
                "Responda como Nara em Markdown. Comece com a linha 'Título: <nome curto do plano>' (sem markdown nessa linha). Depois explique o raciocínio da divisão com listas/subtítulos e peça para confirmar ou ajustar na UI.",
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

  const planTitle = extractConversationTitle(assistantText);
  const persistedText = assistantText
    .replace(/^\s*T[ií]tulo\s*:\s*.+\n?/im, "")
    .trim();

  await db.from("conversation_messages").insert({
    conversation_id: conversationId,
    user_id: opts.userId,
    role: "assistant",
    content: persistedText || assistantText,
  });

  if (planTitle) {
    await conversations.touchTitle(opts.userId, conversationId, planTitle, {
      force: proposedPlan,
    });
    yield { type: "conversationTitle", title: planTitle };
  }

  yield { type: "done" };
}

import { nanoid } from "nanoid";
import { createDbClient } from "@/lib/supabase/admin";
import { getRedis } from "@/server/redis";
import {
  localTodayIso,
  normalizeFutureDate,
  studyPlanDayCount,
} from "@/server/date-utils";
import {
  buildCourseSummaryContent,
  buildDailySessionContent,
} from "@/server/session-template";
import { AppError } from "@/server/http";
import { addDays, formatISO, parseISO } from "date-fns";

export type PlanStepStatus = "pending" | "running" | "done" | "error";

export type PendingPlanStep = {
  id: string;
  tool: string;
  description: string;
  input: Record<string, unknown>;
  status: PlanStepStatus;
  error?: string;
  result?: unknown;
};

export type DraftFormQuestion = {
  prompt: string;
  answer: string;
  choices?: string[];
};

export type ToolPlanPreview = {
  planId: string;
  summary: string;
  steps: {
    id: string;
    tool: string;
    description: string;
    status: PlanStepStatus;
    error?: string;
  }[];
  estimatedCost?: {
    questionCount?: number;
    estimatedCredits?: number;
    estimatedCostUsd?: number;
    model?: string;
    note?: string;
  };
  draftQuestions?: DraftFormQuestion[];
  status: "awaiting_confirmation" | "executing" | "done" | "error" | "expired";
  expiresAt: number;
};

export type PendingPlan = {
  planId: string;
  userId: string;
  conversationId?: string;
  summary: string;
  steps: PendingPlanStep[];
  estimatedCost?: ToolPlanPreview["estimatedCost"];
  draftQuestions?: DraftFormQuestion[];
  createdAt: number;
  expiresAt: number;
};

export const TTL_MS = 10 * 60 * 1000;
const REDIS_PREFIX = "pending_plan:";

/** Fallback local (dev sem Redis/DB). */
const memory = new Map<string, PendingPlan>();

function pruneMemory() {
  const now = Date.now();
  for (const [id, plan] of memory) {
    if (plan.expiresAt <= now) memory.delete(id);
  }
}

async function redisGetSet() {
  return getRedis();
}

async function pgSave(plan: PendingPlan): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await createDbClient();
    const { error } = await db.from("pending_agent_plans").upsert({
      plan_id: plan.planId,
      user_id: plan.userId,
      payload: plan,
      expires_at: new Date(plan.expiresAt).toISOString(),
      created_at: new Date(plan.createdAt).toISOString(),
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "pgSave failed",
    };
  }
}

async function pgGet(planId: string): Promise<PendingPlan | null> {
  const db = await createDbClient();
  await db
    .from("pending_agent_plans")
    .delete()
    .lt("expires_at", new Date().toISOString());

  const { data, error } = await db
    .from("pending_agent_plans")
    .select("payload, expires_at")
    .eq("plan_id", planId)
    .maybeSingle();

  if (error || !data) return null;
  if (new Date(data.expires_at as string).getTime() <= Date.now()) {
    await db.from("pending_agent_plans").delete().eq("plan_id", planId);
    return null;
  }
  return data.payload as PendingPlan;
}

async function pgDelete(planId: string) {
  try {
    const db = await createDbClient();
    await db.from("pending_agent_plans").delete().eq("plan_id", planId);
  } catch {
    // ignore
  }
}

export async function createPendingPlan(input: {
  userId: string;
  conversationId?: string;
  summary: string;
  steps: Omit<PendingPlanStep, "id" | "status">[];
  estimatedCost?: ToolPlanPreview["estimatedCost"];
  draftQuestions?: DraftFormQuestion[];
}): Promise<PendingPlan> {
  const now = Date.now();
  const plan: PendingPlan = {
    planId: nanoid(12),
    userId: input.userId,
    conversationId: input.conversationId,
    summary: input.summary,
    steps: input.steps.map((s) => ({
      ...s,
      id: nanoid(8),
      status: "pending",
    })),
    estimatedCost: input.estimatedCost,
    draftQuestions: input.draftQuestions,
    createdAt: now,
    expiresAt: now + TTL_MS,
  };

  pruneMemory();
  memory.set(plan.planId, plan);

  let durable = false;
  const redis = await redisGetSet();
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${plan.planId}`, plan, {
        ex: Math.ceil(TTL_MS / 1000),
      });
      durable = true;
    } catch {
      // ignore
    }
  }

  const saved = await pgSave(plan);
  if (saved.ok) {
    durable = true;
  } else {
    console.warn("[pending-plans] pgSave falhou:", saved.error);
  }

  if (!durable) {
    memory.delete(plan.planId);
    if (process.env.NODE_ENV === "production") {
      throw new AppError(
        "Não foi possível persistir o plano. Configure Redis ou a tabela pending_agent_plans.",
        503,
        "PLAN_STORE_UNAVAILABLE",
      );
    }
    console.warn(
      "[pending-plans] fallback memória (dev only) — instável em multi-instância",
    );
    memory.set(plan.planId, plan);
  }

  return plan;
}

/** Estende TTL e limpa steps em erro para permitir resume. */
export async function preparePlanResume(
  planId: string,
): Promise<PendingPlan | null> {
  const plan = await getPendingPlan(planId);
  if (!plan) return null;
  const now = Date.now();
  plan.expiresAt = now + TTL_MS;
  for (const step of plan.steps) {
    if (step.status === "error" || step.status === "running") {
      step.status = "pending";
      delete step.error;
    }
  }
  memory.set(planId, plan);
  const redis = await redisGetSet();
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${planId}`, plan, {
        ex: Math.ceil(TTL_MS / 1000),
      });
    } catch {
      // ignore
    }
  }
  await pgSave(plan);
  return plan;
}

export async function getPendingPlan(
  planId: string,
): Promise<PendingPlan | null> {
  const redis = await redisGetSet();
  if (redis) {
    const fromRedis = await redis.get(`${REDIS_PREFIX}${planId}`);
    if (fromRedis) {
      const plan =
        typeof fromRedis === "string"
          ? (JSON.parse(fromRedis) as PendingPlan)
          : (fromRedis as PendingPlan);
      if (plan.expiresAt > Date.now()) return plan;
      await redis.del(`${REDIS_PREFIX}${planId}`);
    }
  }

  try {
    const fromPg = await pgGet(planId);
    if (fromPg) return fromPg;
  } catch {
    // ignore
  }

  pruneMemory();
  const mem = memory.get(planId);
  if (mem && mem.expiresAt > Date.now()) return mem;
  if (mem) memory.delete(planId);
  return null;
}

export async function updatePendingPlan(
  planId: string,
  patch: Partial<Pick<PendingPlan, "draftQuestions" | "steps" | "summary">>,
  opts?: { extendTtl?: boolean },
): Promise<PendingPlan | null> {
  const plan = await getPendingPlan(planId);
  if (!plan) return null;
  Object.assign(plan, patch);
  if (opts?.extendTtl !== false) {
    // Heartbeat: renova TTL a cada step (execução longa não “expira” no meio)
    plan.expiresAt = Date.now() + TTL_MS;
  }
  memory.set(planId, plan);

  const redis = await redisGetSet();
  const ttlSec = Math.max(1, Math.ceil((plan.expiresAt - Date.now()) / 1000));
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${planId}`, plan, { ex: ttlSec });
    } catch {
      // ignore
    }
  }
  await pgSave(plan);
  return plan;
}

/** Plano pendente ainda vivo para uma conversa (restauração na UI). */
export async function getPendingPlanForConversation(
  userId: string,
  conversationId: string,
): Promise<PendingPlan | null> {
  pruneMemory();
  for (const plan of memory.values()) {
    if (
      plan.userId === userId &&
      plan.conversationId === conversationId &&
      plan.expiresAt > Date.now()
    ) {
      return plan;
    }
  }

  try {
    const db = await createDbClient();
    const { data } = await db
      .from("pending_agent_plans")
      .select("payload, expires_at")
      .eq("user_id", userId)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(20);
    for (const row of data ?? []) {
      const plan = row.payload as PendingPlan;
      if (
        plan.conversationId === conversationId &&
        plan.expiresAt > Date.now()
      ) {
        memory.set(plan.planId, plan);
        return plan;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

export async function deletePendingPlan(planId: string) {
  const redis = await redisGetSet();
  if (redis) await redis.del(`${REDIS_PREFIX}${planId}`);
  try {
    await pgDelete(planId);
  } catch {
    // ignore
  }
  memory.delete(planId);
}

export function toToolPlanPreview(
  plan: PendingPlan,
  status?: ToolPlanPreview["status"],
): ToolPlanPreview {
  const expired = plan.expiresAt <= Date.now();
  return {
    planId: plan.planId,
    summary: plan.summary,
    steps: plan.steps.map((s) => ({
      id: s.id,
      tool: s.tool,
      description: s.description,
      status: s.status,
      error: s.error,
    })),
    estimatedCost: plan.estimatedCost,
    draftQuestions: plan.draftQuestions,
    status: status ?? (expired ? "expired" : "awaiting_confirmation"),
    expiresAt: plan.expiresAt,
  };
}

export const PLANABLE_TOOLS = new Set([
  "propose_study_plan",
  "create_folder",
  "create_document",
  "update_document",
  "generate_schedule",
  "generate_form",
]);

export function describeToolStep(
  tool: string,
  input: Record<string, unknown>,
): string {
  switch (tool) {
    case "propose_study_plan":
      return `Plano de estudo “${String(input.folderName ?? "")}”`;
    case "create_folder":
      return `Criar pasta “${String(input.name ?? "")}”`;
    case "create_document":
      return `Criar documento “${String(input.title ?? "")}”`;
    case "update_document":
      return `Atualizar documento ${String(input.documentId ?? "").slice(0, 8)}…`;
    case "generate_schedule":
      return `Gerar cronograma “${String(input.title ?? "")}” (${Array.isArray(input.topics) ? input.topics.length : 0} tópicos)`;
    case "generate_form":
      return `Gerar formulário ${String(input.type ?? "")} (${String(input.questionCount ?? 10)} cards)`;
    default:
      return tool;
  }
}

/** Expande propose_study_plan em steps reais do plano. */
export function expandToPlanSteps(
  tool: string,
  input: Record<string, unknown>,
): { tool: string; description: string; input: Record<string, unknown> }[] {
  if (tool !== "propose_study_plan") {
    return [
      {
        tool,
        description: describeToolStep(tool, input),
        input,
      },
    ];
  }

  const folderName = String(input.folderName ?? "Estudos");
  const summaryTitle = String(
    input.documentTitle ?? `Resumo — ${folderName}`,
  );
  const documentContent = String(input.documentContent ?? "");
  const scheduleTitle = String(input.scheduleTitle ?? `Estudo ${folderName}`);
  const topics = Array.isArray(input.topics)
    ? input.topics.map(String).filter(Boolean)
    : [];
  const topicList = topics.length ? topics : [folderName];
  const includeForm = input.includeForm !== false;
  const formType = String(input.formType ?? "flashcard_deck");
  const formInstruction = String(
    input.formInstruction ??
      `Flashcards de revisão geral: ${topicList.join(", ")}`,
  );
  const questionCount = Number(input.questionCount ?? 8);
  const dailyMinutes = Number(input.dailyMinutes ?? 30);
  const organizationMode =
    input.organizationMode === "by_day" ? "by_day" : "by_topic";

  const lessonNotes = Array.isArray(input.lessonNotes)
    ? (input.lessonNotes as { title?: string; content?: string }[])
        .map((n) => ({
          title: String(n.title ?? "").trim(),
          content: String(n.content ?? "").trim(),
        }))
        .filter((n) => n.title)
    : [];

  const ensureContent = (text: string, fallback: string) => {
    const body = text.length >= 50 ? text : `${text}\n\n${fallback}`.trim();
    return body.length >= 50 ? body : `${fallback} `.repeat(3).slice(0, 120);
  };

  const targetIso = input.targetDate
    ? normalizeFutureDate(String(input.targetDate))
    : undefined;

  const start = parseISO(localTodayIso());
  const dayCount = studyPlanDayCount({ targetDate: targetIso });

  const MAX_DAILY_FORMS = 7; // só a 1ª semana; resto sob demanda depois

  const steps: {
    tool: string;
    description: string;
    input: Record<string, unknown>;
  }[] = [
    {
      tool: "create_folder",
      description: describeToolStep("create_folder", { name: folderName }),
      input: {
        name: folderName,
        _folderKey: "root",
      },
    },
    {
      tool: "create_document",
      description: describeToolStep("create_document", {
        title: summaryTitle.startsWith("Resumo")
          ? summaryTitle
          : `Resumo — ${summaryTitle}`,
      }),
      input: {
        title: summaryTitle.startsWith("Resumo")
          ? summaryTitle
          : `Resumo — ${summaryTitle}`,
        initialContent: ensureContent(
          buildCourseSummaryContent({
            courseName: folderName,
            topics: topicList,
            overview: documentContent,
            targetDate: targetIso,
            dailyMinutes,
          }),
          `Visão geral de ${folderName}.`,
        ),
        _folderKey: "root",
        _docKey: "summary",
      },
    },
  ];

  if (organizationMode === "by_topic") {
    // Pasta por tema + sessões (1 por dia, round-robin nos temas)
    for (let ti = 0; ti < topicList.length; ti++) {
      const topic = topicList[ti]!;
      steps.push({
        tool: "create_folder",
        description: describeToolStep("create_folder", { name: topic }),
        input: {
          name: topic,
          _folderKey: `topic_${ti}`,
          _parentFolderKey: "root",
        },
      });
    }

    const sessionsInTopic = Math.ceil(dayCount / topicList.length);

    for (let i = 0; i < dayCount; i++) {
      const ti = i % topicList.length;
      const topic = topicList[ti]!;
      const sessionNumber = Math.floor(i / topicList.length) + 1;
      const dateIso = formatISO(addDays(start, i), {
        representation: "date",
      });
      const provided = lessonNotes[i];
      const title =
        provided?.title ||
        `Sessão ${sessionNumber} — ${topic} (${dateIso})`;

      const focusFromNote = provided?.content
        ? provided.content
            .split(/[\n.;]/)
            .map((s) => s.trim())
            .filter((s) => s.length > 12)
            .slice(0, 4)
        : [];

      const content = ensureContent(
        buildDailySessionContent({
          courseName: folderName,
          topic,
          sessionNumber,
          sessionsInTopic,
          dateIso,
          dailyMinutes,
          focusPoints:
            focusFromNote.length > 0
              ? focusFromNote
              : [
                  `Conceitos centrais de ${topic}`,
                  `Exemplos e aplicações`,
                  `Erros comuns neste tópico`,
                ],
          studyBody:
            provided?.content && provided.content.length >= 50
              ? provided.content
              : undefined,
          searchQuery: `${topic} ${folderName}`,
        }),
        `Sessão ${sessionNumber} de ${topic}.`,
      );

      steps.push({
        tool: "create_document",
        description: describeToolStep("create_document", { title }),
        input: {
          title,
          initialContent: content,
          _folderKey: `topic_${ti}`,
          _docKey: `session_${i}`,
          _dayIndex: i,
        },
      });
    }
  } else {
    // by_day: pasta "Sessões" + um arquivo por dia
    steps.push({
      tool: "create_folder",
      description: describeToolStep("create_folder", { name: "Sessões" }),
      input: {
        name: "Sessões",
        _folderKey: "sessions",
        _parentFolderKey: "root",
      },
    });

    for (let i = 0; i < dayCount; i++) {
      const topic = topicList[i % topicList.length]!;
      const dateIso = formatISO(addDays(start, i), {
        representation: "date",
      });
      const provided = lessonNotes[i];
      const title =
        provided?.title || `Dia ${i + 1} (${dateIso}) — ${topic}`;
      const content = ensureContent(
        buildDailySessionContent({
          courseName: folderName,
          topic,
          sessionNumber: i + 1,
          sessionsInTopic: dayCount,
          dateIso,
          dailyMinutes,
          focusPoints: [`Foco do dia: ${topic}`],
          studyBody:
            provided?.content && provided.content.length >= 50
              ? provided.content
              : undefined,
          searchQuery: `${topic} ${folderName}`,
        }),
        `Sessão do dia ${i + 1}.`,
      );
      steps.push({
        tool: "create_document",
        description: describeToolStep("create_document", { title }),
        input: {
          title,
          initialContent: content,
          _folderKey: "sessions",
          _docKey: `session_${i}`,
          _dayIndex: i,
        },
      });
    }
  }

  steps.push({
    tool: "generate_schedule",
    description: describeToolStep("generate_schedule", {
      title: scheduleTitle,
      topics: topicList,
    }),
    input: {
      title: scheduleTitle,
      topics: topicList,
      targetDate: targetIso,
      dailyMinutes,
      confirmed: false,
    },
  });

  if (includeForm) {
    // Deck geral no resumo
    steps.push({
      tool: "generate_form",
      description: describeToolStep("generate_form", {
        type: formType,
        questionCount,
      }),
      input: {
        sourceDocumentId: "00000000-0000-4000-8000-000000000000",
        type: formType,
        instruction: formInstruction,
        questionCount,
        confirmed: false,
        _deferredPreview: true,
        _docKey: "summary",
        _formRole: "course_review",
      },
    });

    // Formulário do dia (quiz) por sessão — cap para custo/latência
    const dailyFormCount = Math.min(dayCount, MAX_DAILY_FORMS);
    for (let i = 0; i < dailyFormCount; i++) {
      const topic = topicList[i % topicList.length]!;
      steps.push({
        tool: "generate_form",
        description: `Formulário do dia ${i + 1} (${topic})`,
        input: {
          sourceDocumentId: "00000000-0000-4000-8000-000000000000",
          type: "quiz",
          instruction: `Quiz do dia sobre ${topic} no curso ${folderName}. Inclua 1 questão aberta de reflexão no conjunto se possível via enunciados claros. Baseie-se só no documento da sessão.`,
          questionCount: Math.min(6, questionCount),
          confirmed: false,
          _deferredPreview: true,
          _docKey: `session_${i}`,
          _dayIndex: i,
          _formRole: "daily",
        },
      });
    }
  }

  return steps;
}

export function summarizePlan(steps: { tool: string }[]): string {
  const counts = {
    folder: steps.filter((s) => s.tool === "create_folder").length,
    document: steps.filter(
      (s) => s.tool === "create_document" || s.tool === "update_document",
    ).length,
    schedule: steps.filter((s) => s.tool === "generate_schedule").length,
    form: steps.filter((s) => s.tool === "generate_form").length,
  };
  const parts: string[] = [];
  if (counts.folder) {
    parts.push(`${counts.folder} pasta${counts.folder > 1 ? "s" : ""}`);
  }
  if (counts.document) {
    parts.push(
      `${counts.document} documento${counts.document > 1 ? "s" : ""}`,
    );
  }
  if (counts.schedule) {
    parts.push(
      `${counts.schedule} cronograma${counts.schedule > 1 ? "s" : ""}`,
    );
  }
  if (counts.form) {
    parts.push(`${counts.form} formulário${counts.form > 1 ? "s" : ""}`);
  }
  if (parts.length === 0) return "Vou executar ações no seu espaço de estudo";
  return `Vou criar ${parts.join(", ")}`;
}

import { nanoid } from "nanoid";
import { createDbClient } from "@/lib/supabase/admin";
import { getRedis } from "@/server/redis";
import { normalizeFutureDate } from "@/server/date-utils";

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

  // L1 sempre (mesmo processo / HMR parcial)
  pruneMemory();
  memory.set(plan.planId, plan);

  const redis = await redisGetSet();
  if (redis) {
    try {
      await redis.set(`${REDIS_PREFIX}${plan.planId}`, plan, {
        ex: Math.ceil(TTL_MS / 1000),
      });
    } catch {
      // ignore
    }
  }

  const saved = await pgSave(plan);
  if (!saved.ok) {
    console.warn("[pending-plans] pgSave falhou, usando memória/Redis:", saved.error);
  }

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
): Promise<PendingPlan | null> {
  const plan = await getPendingPlan(planId);
  if (!plan) return null;
  Object.assign(plan, patch);
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
  const includeForm = input.includeForm !== false;
  const formType = String(input.formType ?? "flashcard_deck");
  const formInstruction = String(
    input.formInstruction ??
      `Flashcards sobre: ${topics.join(", ") || folderName}`,
  );
  const questionCount = Number(input.questionCount ?? 8);
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

  const steps: {
    tool: string;
    description: string;
    input: Record<string, unknown>;
  }[] = [
    {
      tool: "create_folder",
      description: describeToolStep("create_folder", { name: folderName }),
      input: { name: folderName },
    },
    {
      tool: "create_document",
      description: describeToolStep("create_document", {
        title: summaryTitle,
      }),
      input: {
        title: summaryTitle.startsWith("Resumo")
          ? summaryTitle
          : `Resumo — ${summaryTitle}`,
        initialContent: ensureContent(
          documentContent,
          `Visão geral de ${folderName}. Tópicos: ${topics.join(", ")}.`,
        ),
      },
    },
  ];

  // Arquivos extras: por tema ou por dia
  const MAX_LESSON_DOCS = 21;
  if (organizationMode === "by_topic") {
    const notes =
      lessonNotes.length > 0
        ? lessonNotes.slice(0, MAX_LESSON_DOCS)
        : topics.slice(0, MAX_LESSON_DOCS).map((t) => ({
            title: t,
            content: `Estudo focado em ${t} (tema ${folderName}). Conceitos-chave, exemplos e pontos de atenção.`,
          }));
    for (const note of notes) {
      steps.push({
        tool: "create_document",
        description: describeToolStep("create_document", {
          title: note.title,
        }),
        input: {
          title: note.title,
          initialContent: ensureContent(
            note.content,
            `Material do tópico ${note.title}.`,
          ),
        },
      });
    }
  } else {
    // by_day: um arquivo por dia até targetDate (cap)
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = input.targetDate
      ? new Date(
          `${normalizeFutureDate(String(input.targetDate))}T00:00:00`,
        )
      : new Date(start.getTime() + 13 * 86400000);
    const dayCount = Math.max(
      1,
      Math.round((end.getTime() - start.getTime()) / 86400000) + 1,
    );
    const n = Math.min(dayCount, MAX_LESSON_DOCS);

    for (let i = 0; i < n; i++) {
      const topic = topics[i % Math.max(topics.length, 1)] ?? folderName;
      const provided = lessonNotes[i];
      const date = new Date(start.getTime() + i * 86400000);
      const iso = date.toISOString().slice(0, 10);
      const title =
        provided?.title ||
        `Dia ${i + 1} (${iso}) — ${topic}`;
      const content =
        provided?.content ||
        `Plano do dia ${i + 1} (${iso}): estudar ${topic}. Objetivos, exercícios e revisão rápida.`;
      steps.push({
        tool: "create_document",
        description: describeToolStep("create_document", { title }),
        input: {
          title,
          initialContent: ensureContent(content, `Sessão do dia ${i + 1}.`),
        },
      });
    }
  }

  steps.push({
    tool: "generate_schedule",
    description: describeToolStep("generate_schedule", {
      title: scheduleTitle,
      topics,
    }),
    input: {
      title: scheduleTitle,
      topics: topics.length ? topics : [folderName],
      targetDate: input.targetDate
        ? normalizeFutureDate(String(input.targetDate))
        : input.targetDate,
      dailyMinutes: input.dailyMinutes ?? 30,
      confirmed: false,
    },
  });

  if (includeForm) {
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
      },
    });
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

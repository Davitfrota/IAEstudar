import { nanoid } from "nanoid";
import { createDbClient } from "@/lib/supabase/admin";

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
    tool: string;
    description: string;
    id: string;
    status: PlanStepStatus;
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
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const { Redis } = await import("@upstash/redis");
    return new Redis({ url, token });
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const Redis = (await import("ioredis")).default;
    const client = new Redis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    if (client.status === "wait") {
      await client.connect().catch(() => undefined);
    }
    return {
      async get(key: string) {
        const v = await client.get(key);
        return v ? (JSON.parse(v) as PendingPlan) : null;
      },
      async set(key: string, value: PendingPlan, opts?: { ex?: number }) {
        const payload = JSON.stringify(value);
        if (opts?.ex) await client.set(key, payload, "EX", opts.ex);
        else await client.set(key, payload);
      },
      async del(key: string) {
        await client.del(key);
      },
    };
  }

  return null;
}

async function pgSave(plan: PendingPlan) {
  const db = await createDbClient();
  await db.from("pending_agent_plans").upsert({
    plan_id: plan.planId,
    user_id: plan.userId,
    payload: plan,
    expires_at: new Date(plan.expiresAt).toISOString(),
    created_at: new Date(plan.createdAt).toISOString(),
  });
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
  const db = await createDbClient();
  await db.from("pending_agent_plans").delete().eq("plan_id", planId);
}

export async function createPendingPlan(input: {
  userId: string;
  summary: string;
  steps: Omit<PendingPlanStep, "id" | "status">[];
  estimatedCost?: ToolPlanPreview["estimatedCost"];
  draftQuestions?: DraftFormQuestion[];
}): Promise<PendingPlan> {
  const now = Date.now();
  const plan: PendingPlan = {
    planId: nanoid(12),
    userId: input.userId,
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

  const redis = await redisGetSet();
  if (redis) {
    await redis.set(`${REDIS_PREFIX}${plan.planId}`, plan, {
      ex: Math.ceil(TTL_MS / 1000),
    });
  }

  try {
    await pgSave(plan);
  } catch {
    pruneMemory();
    memory.set(plan.planId, plan);
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

  const redis = await redisGetSet();
  const ttlSec = Math.max(1, Math.ceil((plan.expiresAt - Date.now()) / 1000));
  if (redis) {
    await redis.set(`${REDIS_PREFIX}${planId}`, plan, { ex: ttlSec });
  }
  try {
    await pgSave(plan);
  } catch {
    memory.set(planId, plan);
  }
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
    })),
    estimatedCost: plan.estimatedCost,
    draftQuestions: plan.draftQuestions,
    status: status ?? (expired ? "expired" : "awaiting_confirmation"),
    expiresAt: plan.expiresAt,
  };
}

export const PLANABLE_TOOLS = new Set([
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

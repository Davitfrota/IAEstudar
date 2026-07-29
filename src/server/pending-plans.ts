import { nanoid } from "nanoid";

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
  steps: { tool: string; description: string; id: string; status: PlanStepStatus }[];
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

const TTL_MS = 10 * 60 * 1000;

/** Em memória (Fase 2). Trocar por Redis (`pending_plan:{id}`, TTL 10m) em produção. */
const plans = new Map<string, PendingPlan>();

function prune() {
  const now = Date.now();
  for (const [id, plan] of plans) {
    if (plan.expiresAt <= now) plans.delete(id);
  }
}

export function createPendingPlan(input: {
  userId: string;
  summary: string;
  steps: Omit<PendingPlanStep, "id" | "status">[];
  estimatedCost?: ToolPlanPreview["estimatedCost"];
  draftQuestions?: DraftFormQuestion[];
}): PendingPlan {
  prune();
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
  plans.set(plan.planId, plan);
  return plan;
}

export function getPendingPlan(planId: string): PendingPlan | null {
  prune();
  return plans.get(planId) ?? null;
}

export function updatePendingPlan(
  planId: string,
  patch: Partial<Pick<PendingPlan, "draftQuestions" | "steps" | "summary">>,
): PendingPlan | null {
  const plan = getPendingPlan(planId);
  if (!plan) return null;
  Object.assign(plan, patch);
  plans.set(planId, plan);
  return plan;
}

export function deletePendingPlan(planId: string) {
  plans.delete(planId);
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

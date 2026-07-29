import { createClient } from "@supabase/supabase-js";
import type { PlanStepStatus, ToolPlanPreview } from "@/server/pending-plans";

/**
 * Publica progresso do plano no canal Realtime `plan:{planId}`
 * (broadcast). ToolPlanCard escuta e atualiza o checklist.
 */
export async function publishPlanProgress(input: {
  planId: string;
  userId: string;
  event: "plan" | "step";
  toolPlan?: ToolPlanPreview;
  step?: {
    stepId: string;
    tool: string;
    status: PlanStepStatus;
    error?: string;
    result?: unknown;
  };
}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return;

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const channel = supabase.channel(`plan:${input.planId}`, {
    config: { broadcast: { ack: false } },
  });

  await new Promise<void>((resolve) => {
    const t = setTimeout(() => resolve(), 1500);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED" || status === "CHANNEL_ERROR") {
        clearTimeout(t);
        resolve();
      }
    });
  });

  await channel.send({
    type: "broadcast",
    event: input.event,
    payload: {
      userId: input.userId,
      toolPlan: input.toolPlan,
      step: input.step,
    },
  });

  await supabase.removeChannel(channel);
}

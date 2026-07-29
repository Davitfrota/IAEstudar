"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ToolPlanPreview } from "@/components/ToolPlanCard";

type StepProgress = {
  stepId: string;
  tool: string;
  status: "pending" | "running" | "done" | "error";
  error?: string;
};

type Options = {
  planId: string | null | undefined;
  enabled?: boolean;
  onPlan?: (plan: ToolPlanPreview) => void;
  onStep?: (step: StepProgress) => void;
};

/** Escuta broadcast Realtime `plan:{planId}` (checklist ao executar). */
export function usePlanProgress({
  planId,
  enabled = true,
  onPlan,
  onStep,
}: Options) {
  const onPlanRef = useRef(onPlan);
  const onStepRef = useRef(onStep);
  onPlanRef.current = onPlan;
  onStepRef.current = onStep;

  useEffect(() => {
    if (!enabled || !planId) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`plan:${planId}`)
      .on("broadcast", { event: "plan" }, ({ payload }) => {
        const toolPlan = (payload as { toolPlan?: ToolPlanPreview })?.toolPlan;
        if (toolPlan) onPlanRef.current?.(toolPlan);
      })
      .on("broadcast", { event: "step" }, ({ payload }) => {
        const step = (payload as { step?: StepProgress })?.step;
        if (step) onStepRef.current?.(step);
      });

    void channel.subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [planId, enabled]);
}

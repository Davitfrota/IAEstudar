import { requireAppUser } from "@/server/auth";
import { fail, ok, AppError } from "@/server/http";
import {
  deletePendingPlan,
  getPendingPlan,
  toToolPlanPreview,
} from "@/server/pending-plans";

type Params = { params: Promise<{ planId: string }> };

export async function POST(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { planId } = await params;
    const plan = await getPendingPlan(planId);

    if (!plan) {
      return ok({
        toolPlan: {
          planId,
          summary: "Plano já expirado ou cancelado",
          steps: [],
          status: "expired",
          expiresAt: Date.now(),
        },
      });
    }

    if (plan.userId !== user.id) {
      throw new AppError("Plano de outro usuário", 403, "PLAN_FORBIDDEN");
    }

    await deletePendingPlan(planId);
    return ok({
      toolPlan: toToolPlanPreview(plan, "expired"),
      cancelled: true,
    });
  } catch (error) {
    return fail(error);
  }
}

import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import {
  getPendingPlanForConversation,
  toToolPlanPreview,
} from "@/server/pending-plans";
import { ConversationService } from "@/server/services/conversation-service";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireAppUser();
    const { id } = await params;
    const result = await new ConversationService().getWithMessages(
      user.id,
      id,
    );
    const pending = await getPendingPlanForConversation(user.id, id);
    const pendingPlan = pending
      ? toToolPlanPreview(
          pending,
          pending.steps.some((s) => s.status === "error")
            ? "error"
            : pending.steps.some((s) => s.status === "done")
              ? "error"
              : "awaiting_confirmation",
        )
      : null;
    return ok({ ...result, pendingPlan });
  } catch (error) {
    return fail(error);
  }
}

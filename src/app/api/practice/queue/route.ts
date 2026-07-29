import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { practiceQueueQuerySchema } from "@/server/schemas";
import { FormService } from "@/server/services/form-service";

export async function GET(request: Request) {
  try {
    const user = await requireAppUser();
    const url = new URL(request.url);
    const query = practiceQueueQuerySchema.parse({
      formId: url.searchParams.get("formId") ?? undefined,
      date: url.searchParams.get("date") ?? undefined,
      limit: url.searchParams.get("limit") ?? undefined,
    });

    const forms = new FormService();
    const session = await forms.startPracticeSession(user.id, query.formId);
    const { questions, totalDue } = await forms.getPracticeQueue(user.id, {
      formId: query.formId,
      date: query.date,
      limit: query.limit,
    });

    return ok({
      sessionId: session.id,
      questions,
      totalDue,
      sessionLimit: query.limit,
    });
  } catch (error) {
    return fail(error);
  }
}

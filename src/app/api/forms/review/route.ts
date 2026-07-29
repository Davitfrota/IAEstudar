import { requireAppUser } from "@/server/auth";
import { fail, ok, parseJson } from "@/server/http";
import { recordReviewSchema } from "@/server/schemas";
import { FormService } from "@/server/services/form-service";

export async function POST(request: Request) {
  try {
    const user = await requireAppUser();
    const body = await parseJson(request, recordReviewSchema);
    const result = await new FormService().recordReview(
      user.id,
      body.formQuestionId,
      body.rating,
    );
    return ok(result);
  } catch (error) {
    return fail(error);
  }
}

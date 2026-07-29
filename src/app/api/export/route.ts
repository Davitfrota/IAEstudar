import { createAdminClient } from "@/lib/supabase/admin";
import { requireAppUser } from "@/server/auth";
import { fail, ok } from "@/server/http";
import { assertExportRateLimit } from "@/server/rate-limit";

export async function GET() {
  try {
    const user = await requireAppUser();
    assertExportRateLimit(user.id);

    const db = createAdminClient();
    const [
      folders,
      documents,
      schedules,
      items,
      forms,
      questions,
      reviews,
      actions,
    ] = await Promise.all([
      db.from("folders").select("*").eq("user_id", user.id),
      db.from("documents").select("*").eq("user_id", user.id),
      db.from("study_schedules").select("*").eq("user_id", user.id),
      db.from("schedule_items").select("*").eq("user_id", user.id),
      db.from("forms").select("*").eq("user_id", user.id),
      db
        .from("form_questions")
        .select("*, forms!inner(user_id)")
        .eq("forms.user_id", user.id),
      db.from("form_reviews").select("*").eq("user_id", user.id),
      db.from("agent_actions").select("*").eq("user_id", user.id),
    ]);

    return ok({
      exportedAt: new Date().toISOString(),
      user: { id: user.id, clerk_id: user.clerk_id, email: user.email },
      folders: folders.data,
      documents: documents.data,
      study_schedules: schedules.data,
      schedule_items: items.data,
      forms: forms.data,
      form_questions: questions.data,
      form_reviews: reviews.data,
      agent_actions: actions.data,
    });
  } catch (error) {
    return fail(error);
  }
}

import { createAdminClient } from "@/lib/supabase/admin";
import { requireAppUser } from "@/server/auth";
import { fetchAllRows } from "@/server/export-fetch";
import { fail, ok } from "@/server/http";
import { assertExportRateLimit } from "@/server/rate-limit";

export async function GET() {
  try {
    const user = await requireAppUser();

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
      fetchAllRows((from, to) =>
        db
          .from("folders")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("documents")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("study_schedules")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("schedule_items")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("forms")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("form_questions")
          .select("*, forms!inner(user_id)")
          .eq("forms.user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("form_reviews")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
      fetchAllRows((from, to) =>
        db
          .from("agent_actions")
          .select("*")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to),
      ),
    ]);

    // Só consome a cota diária após export completo — falha não bloqueia retry.
    assertExportRateLimit(user.id);

    return ok({
      exportedAt: new Date().toISOString(),
      user: { id: user.id, clerk_id: user.clerk_id, email: user.email },
      folders,
      documents,
      study_schedules: schedules,
      schedule_items: items,
      forms,
      form_questions: questions,
      form_reviews: reviews,
      agent_actions: actions,
    });
  } catch (error) {
    return fail(error);
  }
}

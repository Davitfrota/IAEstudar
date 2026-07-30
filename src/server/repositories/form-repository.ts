import type { AdminClient } from "@/lib/supabase/admin";
import type {
  Form,
  FormQuestion,
  FormQuestionSummary,
  FsrsCardState,
} from "@/server/types";

export class FormRepository {
  constructor(private db: AdminClient) {}

  async list(userId: string): Promise<Form[]> {
    const { data, error } = await this.db
      .from("forms")
      .select("*")
      .eq("user_id", userId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []) as Form[];
  }

  async getOwned(userId: string, formId: string): Promise<Form | null> {
    const { data, error } = await this.db
      .from("forms")
      .select("*")
      .eq("id", formId)
      .eq("user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    return data as Form | null;
  }

  async create(
    userId: string,
    input: {
      sourceDocumentId: string;
      title: string;
      type: Form["type"];
      generationInstruction?: string;
      scheduleItemId?: string | null;
    },
  ): Promise<Form> {
    const { data, error } = await this.db
      .from("forms")
      .insert({
        user_id: userId,
        source_document_id: input.sourceDocumentId,
        title: input.title,
        type: input.type,
        generation_instruction: input.generationInstruction ?? null,
        schedule_item_id: input.scheduleItemId ?? null,
      })
      .select("*")
      .single();

    if (error) throw error;
    return data as Form;
  }

  async createQuestions(
    questions: Array<{
      form_id: string;
      type: FormQuestion["type"];
      prompt: string;
      answer: string;
      choices?: unknown;
      position: number;
    }>,
  ): Promise<FormQuestion[]> {
    const { data, error } = await this.db
      .from("form_questions")
      .insert(questions)
      .select("*");

    if (error) throw error;
    return (data ?? []) as FormQuestion[];
  }

  async getQuestionOwned(
    userId: string,
    questionId: string,
  ): Promise<FormQuestion | null> {
    const { data, error } = await this.db
      .from("form_questions")
      .select("*, forms!inner(user_id)")
      .eq("id", questionId)
      .eq("forms.user_id", userId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw error;
    if (!data) return null;
    const { forms: _forms, ...question } = data as FormQuestion & {
      forms: { user_id: string };
    };
    return question as FormQuestion;
  }

  async listDue(
    userId: string,
    opts: { date?: string; folderId?: string } = {},
  ): Promise<FormQuestionSummary[]> {
    const dueAt = opts.date ?? new Date().toISOString();

    let query = this.db
      .from("form_questions")
      .select(
        "id, form_id, type, prompt, fsrs_due, fsrs_state, position, forms!inner(user_id, title, deleted_at, source_document_id, documents:source_document_id(folder_id))",
      )
      .eq("forms.user_id", userId)
      .is("deleted_at", null)
      .is("forms.deleted_at", null)
      .lte("fsrs_due", dueAt)
      .order("fsrs_due", { ascending: true })
      .limit(100);

    const { data, error } = await query;
    if (error) throw error;

    type DueRow = FormQuestionSummary & {
      forms:
        | {
            title: string;
            documents: { folder_id: string | null } | { folder_id: string | null }[] | null;
          }
        | Array<{
            title: string;
            documents: { folder_id: string | null } | { folder_id: string | null }[] | null;
          }>;
    };

    const rows = (data ?? []) as unknown as DueRow[];

    return rows
      .filter((row) => {
        if (!opts.folderId) return true;
        const forms = Array.isArray(row.forms) ? row.forms[0] : row.forms;
        const docs = forms?.documents;
        const folderId = Array.isArray(docs)
          ? docs[0]?.folder_id
          : docs?.folder_id;
        return folderId === opts.folderId;
      })
      .map((row) => {
        const forms = Array.isArray(row.forms) ? row.forms[0] : row.forms;
        return {
          id: row.id,
          form_id: row.form_id,
          type: row.type,
          prompt: row.prompt,
          fsrs_due: row.fsrs_due,
          fsrs_state: row.fsrs_state,
          position: row.position,
          form_title: forms?.title,
        };
      });
  }

  async listQuestions(formId: string): Promise<FormQuestion[]> {
    const { data, error } = await this.db
      .from("form_questions")
      .select("*")
      .eq("form_id", formId)
      .is("deleted_at", null)
      .order("position", { ascending: true });

    if (error) throw error;
    return (data ?? []) as FormQuestion[];
  }

  async listDueForForm(
    userId: string,
    formId: string,
  ): Promise<FormQuestion[]> {
    const { data, error } = await this.db
      .from("form_questions")
      .select("*, forms!inner(user_id, deleted_at)")
      .eq("form_id", formId)
      .eq("forms.user_id", userId)
      .is("deleted_at", null)
      .is("forms.deleted_at", null)
      .lte("fsrs_due", new Date().toISOString())
      .order("fsrs_due", { ascending: true });

    if (error) throw error;

    return ((data ?? []) as Array<FormQuestion & { forms: unknown }>).map(
      ({ forms: _f, ...q }) => q as FormQuestion,
    );
  }

  async updateFsrsState(
    questionId: string,
    state: FsrsCardState,
  ): Promise<FormQuestion> {
    const { data, error } = await this.db
      .from("form_questions")
      .update({
        fsrs_state: state.state,
        fsrs_due: state.due,
        fsrs_stability: state.stability,
        fsrs_difficulty: state.difficulty,
        fsrs_elapsed_days: state.elapsed_days,
        fsrs_scheduled_days: state.scheduled_days,
        fsrs_reps: state.reps,
        fsrs_lapses: state.lapses,
        fsrs_learning_steps: state.learning_steps,
        fsrs_last_review: state.last_review,
      })
      .eq("id", questionId)
      .select("*")
      .single();

    if (error) throw error;
    return data as FormQuestion;
  }

  async insertReview(input: {
    formQuestionId: string;
    userId: string;
    rating: string;
    stateBefore: FsrsCardState;
    stateAfter: FsrsCardState;
  }): Promise<void> {
    const { error } = await this.db.from("form_reviews").insert({
      form_question_id: input.formQuestionId,
      user_id: input.userId,
      rating: input.rating,
      state_before: input.stateBefore,
      state_after: input.stateAfter,
    });

    if (error) throw error;
  }

  async countDue(userId: string): Promise<number> {
    const { count, error } = await this.db
      .from("form_questions")
      .select("id, forms!inner(user_id, deleted_at)", {
        count: "exact",
        head: true,
      })
      .eq("forms.user_id", userId)
      .is("deleted_at", null)
      .is("forms.deleted_at", null)
      .lte("fsrs_due", new Date().toISOString());

    if (error) throw error;
    return count ?? 0;
  }

  async softDelete(userId: string, formId: string): Promise<void> {
    const { error } = await this.db
      .from("forms")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", formId)
      .eq("user_id", userId)
      .is("deleted_at", null);

    if (error) throw error;
  }
}

export type Folder = {
  id: string;
  user_id: string;
  parent_folder_id: string | null;
  name: string;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type Document = {
  id: string;
  user_id: string;
  folder_id: string | null;
  title: string;
  content: unknown;
  content_text: string;
  position: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type StudySchedule = {
  id: string;
  user_id: string;
  title: string;
  target_date: string | null;
  status: "active" | "completed" | "archived";
  created_by: "user" | "agent";
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type ScheduleItem = {
  id: string;
  schedule_id: string;
  user_id: string;
  folder_id: string | null;
  document_id: string | null;
  scheduled_date: string;
  duration_minutes: number;
  topic: string | null;
  status: "pending" | "done" | "skipped";
  position: number;
  created_at: string;
  updated_at: string;
};

export type Form = {
  id: string;
  user_id: string;
  source_document_id: string;
  schedule_item_id: string | null;
  title: string;
  type: "flashcard_deck" | "quiz" | "open_form";
  generation_instruction: string | null;
  is_stale: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FormQuestion = {
  id: string;
  form_id: string;
  type: "qa" | "cloze" | "multiple_choice" | "open";
  prompt: string;
  answer: string;
  choices: unknown;
  position: number;
  fsrs_state: "new" | "learning" | "review" | "relearning";
  fsrs_due: string;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_elapsed_days: number;
  fsrs_scheduled_days: number;
  fsrs_reps: number;
  fsrs_lapses: number;
  fsrs_last_review: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};

export type FormQuestionSummary = Pick<
  FormQuestion,
  "id" | "form_id" | "type" | "prompt" | "fsrs_due" | "fsrs_state" | "position"
> & {
  form_title?: string;
};

export type FsrsCardState = {
  state: FormQuestion["fsrs_state"];
  due: string;
  stability: number | null;
  difficulty: number | null;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  last_review: string | null;
};

export type AppUser = {
  id: string;
  email: string | null;
};

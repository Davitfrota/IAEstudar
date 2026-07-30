import {
  createEmptyCard,
  State,
  type Card,
} from "ts-fsrs";
import type { FormQuestion, FsrsCardState } from "@/server/types";

const stateToDb: Record<State, FormQuestion["fsrs_state"]> = {
  [State.New]: "new",
  [State.Learning]: "learning",
  [State.Review]: "review",
  [State.Relearning]: "relearning",
};

const dbToState: Record<FormQuestion["fsrs_state"], State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

/** Reconstrói o Card do ts-fsrs a partir da linha persistida. */
export function toFsrsCard(q: FormQuestion): Card {
  const empty = createEmptyCard(new Date(q.created_at));
  return {
    ...empty,
    due: new Date(q.fsrs_due),
    stability: q.fsrs_stability ?? empty.stability,
    difficulty: q.fsrs_difficulty ?? empty.difficulty,
    elapsed_days: q.fsrs_elapsed_days,
    scheduled_days: q.fsrs_scheduled_days,
    reps: q.fsrs_reps,
    lapses: q.fsrs_lapses,
    learning_steps: q.fsrs_learning_steps ?? empty.learning_steps,
    state: dbToState[q.fsrs_state],
    last_review: q.fsrs_last_review
      ? new Date(q.fsrs_last_review)
      : undefined,
  };
}

/** Serializa o Card para colunas + JSON de auditoria em form_reviews. */
export function fromFsrsCard(card: Card): FsrsCardState {
  return {
    state: stateToDb[card.state],
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    learning_steps: card.learning_steps,
    last_review: card.last_review?.toISOString() ?? null,
  };
}

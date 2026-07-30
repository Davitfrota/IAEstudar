import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
} from "ts-fsrs";
import { fromFsrsCard, toFsrsCard } from "@/server/fsrs-mapping";
import type { FormQuestion } from "@/server/types";

function questionFromCard(
  createdAt: string,
  card: ReturnType<typeof createEmptyCard>,
  overrides: Partial<FormQuestion> = {},
): FormQuestion {
  const state = fromFsrsCard(card);
  return {
    id: "00000000-0000-4000-8000-000000000001",
    form_id: "00000000-0000-4000-8000-000000000002",
    type: "qa",
    prompt: "p",
    answer: "a",
    choices: null,
    position: 0,
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
    created_at: createdAt,
    updated_at: createdAt,
    deleted_at: null,
    ...overrides,
  };
}

describe("fsrs-mapping learning_steps", () => {
  it("persists learning_steps so Good→Good graduates to review", () => {
    const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
    const createdAt = "2026-07-01T00:00:00.000Z";
    const t0 = new Date("2026-07-01T12:00:00.000Z");
    const t1 = new Date("2026-07-01T12:10:00.000Z");

    const first = scheduler.next(createEmptyCard(new Date(createdAt)), t0, Rating.Good);
    assert.equal(first.card.state, State.Learning);
    assert.equal(first.card.learning_steps, 1);

    const persisted = questionFromCard(createdAt, first.card);
    assert.equal(persisted.fsrs_learning_steps, 1);

    const rehydrated = toFsrsCard(persisted);
    assert.equal(rehydrated.learning_steps, 1);

    const second = scheduler.next(rehydrated, t1, Rating.Good);
    const correct = scheduler.next(first.card, t1, Rating.Good);

    assert.equal(second.card.state, State.Review);
    assert.equal(second.card.state, correct.card.state);
    assert.equal(second.card.due.toISOString(), correct.card.due.toISOString());
    assert.equal(second.card.stability, correct.card.stability);
  });

  it("without learning_steps, Good→Good stays stuck in short learning", () => {
    const scheduler = fsrs(generatorParameters({ enable_fuzz: false }));
    const createdAt = "2026-07-01T00:00:00.000Z";
    const t0 = new Date("2026-07-01T12:00:00.000Z");
    const t1 = new Date("2026-07-01T12:10:00.000Z");

    const first = scheduler.next(createEmptyCard(new Date(createdAt)), t0, Rating.Good);
    const broken = questionFromCard(createdAt, first.card, {
      fsrs_learning_steps: 0,
    });

    const stuck = scheduler.next(toFsrsCard(broken), t1, Rating.Good);
    const correct = scheduler.next(first.card, t1, Rating.Good);

    assert.equal(stuck.card.state, State.Learning);
    assert.equal(correct.card.state, State.Review);
    assert.notEqual(stuck.card.due.toISOString(), correct.card.due.toISOString());
  });
});

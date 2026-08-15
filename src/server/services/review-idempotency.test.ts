import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { reviewResultFromExisting } from "./review-idempotency";
import type { FsrsCardState } from "../types";

describe("reviewResultFromExisting", () => {
  it("devolve nextDue e newState a partir da revisão já gravada", () => {
    const state: FsrsCardState = {
      due: "2026-08-16T12:00:00.000Z",
      state: "review",
      stability: 1.2,
      difficulty: 5,
      elapsed_days: 0,
      scheduled_days: 1,
      reps: 2,
      lapses: 0,
      last_review: "2026-08-15T16:00:00.000Z",
    };
    assert.deepEqual(reviewResultFromExisting({ state_after: state }), {
      nextDue: state.due,
      newState: state,
    });
  });
});

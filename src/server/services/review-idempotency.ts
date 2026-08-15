import type { FsrsCardState } from "@/server/types";

/**
 * Resposta estável para retries que reutilizam a mesma idempotencyKey
 * após o insert em form_reviews já ter sido commitado.
 */
export function reviewResultFromExisting(existing: {
  state_after: FsrsCardState;
}): { nextDue: string; newState: FsrsCardState } {
  return {
    nextDue: existing.state_after.due,
    newState: existing.state_after,
  };
}

/**
 * Smoke de carga no rate limit em memória.
 * Uso: pnpm test:load
 */
import {
  __resetMemoryRateLimit,
  takeSlotSync,
} from "../src/server/rate-limit";

const LIMIT = 20;
const USERS = 50;
const ATTEMPTS = 40;

__resetMemoryRateLimit();

let allowed = 0;
let blocked = 0;
const started = Date.now();

for (let u = 0; u < USERS; u++) {
  const key = `load:agent-chat:user-${u}`;
  for (let i = 0; i < ATTEMPTS; i++) {
    if (takeSlotSync(key, LIMIT, 60 * 60 * 1000)) allowed += 1;
    else blocked += 1;
  }
}

const elapsed = Date.now() - started;
const expectedAllowed = USERS * LIMIT;
const expectedBlocked = USERS * (ATTEMPTS - LIMIT);

console.log(
  JSON.stringify(
    {
      elapsedMs: elapsed,
      users: USERS,
      attemptsPerUser: ATTEMPTS,
      allowed,
      blocked,
      expectedAllowed,
      expectedBlocked,
      ok: allowed === expectedAllowed && blocked === expectedBlocked,
    },
    null,
    2,
  ),
);

if (allowed !== expectedAllowed || blocked !== expectedBlocked) {
  process.exit(1);
}

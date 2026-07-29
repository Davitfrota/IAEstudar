import { AppError } from "@/server/http";
import { getRedis } from "@/server/redis";

/**
 * Rate limit: Redis (Upstash/REDIS_URL) quando disponível;
 * fallback em memória (dev / single-instance).
 */

type Bucket = { count: number; resetAt: number };

const memory = new Map<string, Bucket>();

function takeMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = memory.get(key);

  if (!current || current.resetAt <= now) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

async function takeRedis(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean | null> {
  try {
    const redis = await getRedis();
    if (!redis) return null;
    const redisKey = `rl:${key}`;
    const count = await redis.incr(redisKey);
    if (count === 1) {
      await redis.expire(redisKey, Math.ceil(windowMs / 1000));
    }
    return count <= limit;
  } catch {
    return null;
  }
}

export async function takeSlot(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const fromRedis = await takeRedis(key, limit, windowMs);
  if (fromRedis !== null) return fromRedis;
  return takeMemory(key, limit, windowMs);
}

/** Sync helper for unit tests / legacy callers — memória only. */
export function takeSlotSync(
  key: string,
  limit: number,
  windowMs: number,
): boolean {
  return takeMemory(key, limit, windowMs);
}

export async function assertAgentChatRateLimit(userId: string) {
  const ok = await takeSlot(`agent-chat:${userId}`, 20, 60 * 60 * 1000);
  if (!ok) {
    throw new AppError(
      "Limite de 20 mensagens/hora atingido",
      429,
      "RATE_LIMIT",
    );
  }
}

export async function assertGenerateRateLimit(userId: string, tool: string) {
  const ok = await takeSlot(
    `generate:${tool}:${userId}`,
    10,
    24 * 60 * 60 * 1000,
  );
  if (!ok) {
    throw new AppError(
      `Limite de 10 ${tool}/dia atingido`,
      429,
      "RATE_LIMIT",
    );
  }
}

export async function assertExportRateLimit(userId: string) {
  const ok = await takeSlot(`export:${userId}`, 1, 24 * 60 * 60 * 1000);
  if (!ok) {
    throw new AppError("Export permitido 1x por dia", 429, "RATE_LIMIT");
  }
}

/** Só testes. */
export function __resetMemoryRateLimit() {
  memory.clear();
}

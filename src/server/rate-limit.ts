import { AppError } from "@/server/http";

/**
 * Rate limit em memória (Fase 1). Em produção, trocar por Redis.
 * Não compartilha estado entre instâncias serverless.
 */

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

function take(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }

  if (current.count >= limit) {
    return false;
  }

  current.count += 1;
  return true;
}

export function assertAgentChatRateLimit(userId: string) {
  const ok = take(`agent-chat:${userId}`, 20, 60 * 60 * 1000);
  if (!ok) {
    throw new AppError(
      "Limite de 20 mensagens/hora atingido",
      429,
      "RATE_LIMIT",
    );
  }
}

export function assertGenerateRateLimit(userId: string, tool: string) {
  const ok = take(`generate:${tool}:${userId}`, 10, 24 * 60 * 60 * 1000);
  if (!ok) {
    throw new AppError(
      `Limite de 10 ${tool}/dia atingido`,
      429,
      "RATE_LIMIT",
    );
  }
}

export function assertExportRateLimit(userId: string) {
  const ok = take(`export:${userId}`, 1, 24 * 60 * 60 * 1000);
  if (!ok) {
    throw new AppError("Export permitido 1x por dia", 429, "RATE_LIMIT");
  }
}

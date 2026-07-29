import { Redis } from "@upstash/redis";

export type RedisLike = {
  get: (key: string) => Promise<unknown>;
  set: (
    key: string,
    value: unknown,
    opts?: { ex?: number; nx?: boolean },
  ) => Promise<unknown>;
  del: (key: string) => Promise<unknown>;
  incr: (key: string) => Promise<number>;
  expire: (key: string, seconds: number) => Promise<unknown>;
};

let cached: RedisLike | null | undefined;

/** Upstash REST preferencial; REDIS_URL (ioredis) como alternativa. */
export async function getRedis(): Promise<RedisLike | null> {
  if (cached !== undefined) return cached;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    const client = new Redis({ url, token });
    cached = {
      get: (key) => client.get(key),
      set: (key, value, opts) =>
        client.set(
          key,
          value as never,
          opts?.ex
            ? opts.nx
              ? { ex: opts.ex, nx: true }
              : { ex: opts.ex }
            : opts?.nx
              ? { nx: true }
              : undefined,
        ),
      del: (key) => client.del(key),
      incr: (key) => client.incr(key),
      expire: (key, seconds) => client.expire(key, seconds),
    };
    return cached;
  }

  const redisUrl = process.env.REDIS_URL;
  if (redisUrl) {
    const IoRedis = (await import("ioredis")).default;
    const client = new IoRedis(redisUrl, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
    });
    if (client.status === "wait") {
      await client.connect().catch(() => undefined);
    }
    cached = {
      async get(key) {
        const v = await client.get(key);
        if (v == null) return null;
        try {
          return JSON.parse(v) as unknown;
        } catch {
          return v;
        }
      },
      async set(key, value, opts) {
        const payload =
          typeof value === "string" ? value : JSON.stringify(value);
        if (opts?.nx && opts.ex) {
          return client.set(key, payload, "EX", opts.ex, "NX");
        }
        if (opts?.nx) return client.set(key, payload, "NX");
        if (opts?.ex) return client.set(key, payload, "EX", opts.ex);
        return client.set(key, payload);
      },
      async del(key) {
        return client.del(key);
      },
      async incr(key) {
        return client.incr(key);
      },
      async expire(key, seconds) {
        return client.expire(key, seconds);
      },
    };
    return cached;
  }

  cached = null;
  return null;
}

/** Só para testes. */
export function __resetRedisCache() {
  cached = undefined;
}

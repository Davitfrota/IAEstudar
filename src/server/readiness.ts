import { createClient } from "@supabase/supabase-js";
import { getRedis } from "@/server/redis";

export type CheckResult = {
  ok: boolean;
  detail?: string;
  [key: string]: unknown;
};

export type ReadinessReport = {
  ok: boolean;
  readyFor: {
    smoke: boolean;
    agent: boolean;
    durablePlans: boolean;
    realtimeProgress: boolean;
  };
  checks: {
    supabase: CheckResult;
    groq: CheckResult;
    plansStore: CheckResult;
    redis: CheckResult;
    realtime: CheckResult;
  };
};

function supabaseUrl() {
  return process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
}

function supabaseAnonKey() {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ""
  );
}

export async function checkReadiness(): Promise<ReadinessReport> {
  const supabase = await checkSupabase();
  const groq = await checkGroq();
  const redis = await checkRedis();
  const plansStore = await checkPlansStore(redis.ok);
  const realtime = await checkRealtime();

  const smoke = supabase.ok;
  const agent = supabase.ok && groq.ok;
  const durablePlans = plansStore.ok && plansStore.backend !== "memory";
  const realtimeProgress = supabase.ok && realtime.ok;

  return {
    ok: smoke && agent && durablePlans,
    readyFor: {
      smoke,
      agent,
      durablePlans,
      realtimeProgress,
    },
    checks: {
      supabase,
      groq,
      plansStore,
      redis,
      realtime,
    },
  };
}

async function checkSupabase(): Promise<CheckResult> {
  const url = supabaseUrl();
  const key = supabaseAnonKey();
  if (!url || !key) {
    return { ok: false, detail: "NEXT_PUBLIC_SUPABASE_URL/ANON_KEY ausentes" };
  }

  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: key },
      cache: "no-store",
    });
    return {
      ok: res.ok,
      project: url,
      status: res.status,
      detail: res.ok ? "auth health ok" : await res.text(),
    };
  } catch (err) {
    return {
      ok: false,
      project: url,
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function checkGroq(): Promise<CheckResult> {
  const apiKey = process.env.GROQ_API_KEY;
  const model = process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  if (!apiKey) {
    return { ok: false, model, detail: "GROQ_API_KEY ausente" };
  }

  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    return {
      ok: res.ok,
      model,
      configured: true,
      detail: res.ok ? "groq models ok" : `HTTP ${res.status}`,
    };
  } catch (err) {
    return {
      ok: false,
      model,
      configured: true,
      detail: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function checkRedis(): Promise<CheckResult> {
  const configured = Boolean(
    (process.env.UPSTASH_REDIS_REST_URL &&
      process.env.UPSTASH_REDIS_REST_TOKEN) ||
      process.env.REDIS_URL,
  );
  if (!configured) {
    return {
      ok: false,
      configured: false,
      detail: "Redis opcional — Upstash ou REDIS_URL não configurados",
    };
  }

  try {
    const redis = await getRedis();
    if (!redis) {
      return { ok: false, configured: true, detail: "cliente redis null" };
    }
    const probeKey = `health:probe:${Date.now()}`;
    await redis.set(probeKey, "1", { ex: 30 });
    await redis.del(probeKey);
    return { ok: true, configured: true, detail: "redis write/delete ok" };
  } catch (err) {
    return {
      ok: false,
      configured: true,
      detail: err instanceof Error ? err.message : "redis failed",
    };
  }
}

async function checkPlansStore(redisOk: boolean): Promise<CheckResult> {
  if (redisOk) {
    return {
      ok: true,
      backend: "redis",
      detail: "pending_plan:* no Redis (TTL 10min)",
    };
  }

  const url = supabaseUrl();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = supabaseAnonKey();

  if (!url || (!serviceKey && !anon)) {
    return {
      ok: false,
      backend: "memory",
      detail: "sem credenciais para checar pending_agent_plans",
    };
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const db = createClient(url, serviceKey || anon, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await db
      .from("pending_agent_plans")
      .select("plan_id")
      .limit(1);

    // Com anon + RLS deny, erro/vazio é esperado — tabela existe se não for 404/PGRST.
    if (error) {
      const missing =
        /does not exist|schema cache|PGRST205/i.test(error.message) ||
        error.code === "42P01";
      if (missing) {
        return {
          ok: false,
          backend: "memory",
          detail: `tabela pending_agent_plans indisponível: ${error.message}`,
        };
      }
      // RLS bloqueou = tabela existe
      return {
        ok: true,
        backend: "postgres",
        detail: `pending_agent_plans presente (acesso: ${error.message})`,
      };
    }

    return {
      ok: true,
      backend: "postgres",
      detail: serviceKey
        ? "pending_agent_plans ok (service role)"
        : "pending_agent_plans ok (anon probe)",
    };
  } catch (err) {
    return {
      ok: false,
      backend: "memory",
      detail:
        err instanceof Error
          ? err.message
          : "fallback memória — sem Postgres/Redis",
    };
  }
}

async function checkRealtime(): Promise<CheckResult> {
  const url = supabaseUrl();
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? supabaseAnonKey();
  if (!url || !key) {
    return { ok: false, detail: "Supabase env ausente para Realtime" };
  }

  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const channel = supabase.channel(`health:${Date.now()}`);
    const status = await new Promise<string>((resolve) => {
      const t = setTimeout(() => resolve("TIMEOUT"), 2500);
      channel.subscribe((s) => {
        if (s === "SUBSCRIBED" || s === "CHANNEL_ERROR" || s === "TIMED_OUT") {
          clearTimeout(t);
          resolve(s);
        }
      });
    });
    await supabase.removeChannel(channel);
    return {
      ok: status === "SUBSCRIBED",
      detail: `broadcast channel ${status}`,
      project: url,
    };
  } catch (err) {
    return {
      ok: false,
      detail: err instanceof Error ? err.message : "realtime failed",
      project: url,
    };
  }
}

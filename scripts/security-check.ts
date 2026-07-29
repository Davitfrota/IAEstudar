/**
 * Verifica isolamento multi-usuário (RLS) e tabela de planos.
 * Uso: pnpm test:security
 *
 * - Sempre: anon sem sessão não lista pastas de ninguém
 * - Com SUPABASE_SERVICE_ROLE_KEY: valida pending_agent_plans
 */
import { createClient } from "@supabase/supabase-js";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !anon) {
    console.error("Env NEXT_PUBLIC_SUPABASE_* incompleto");
    process.exit(1);
  }

  const anonClient = createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: leaked, error: leakErr } = await anonClient
    .from("folders")
    .select("id")
    .limit(5);

  const leakedCount = leaked?.length ?? 0;
  const rlsLooksOk = leakedCount === 0;

  let pendingPlansTable: boolean | "skipped" = "skipped";
  let pendingPlansError: string | null = null;

  if (service) {
    const admin = createClient(url, service, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await admin
      .from("pending_agent_plans")
      .select("plan_id")
      .limit(1);
    pendingPlansTable = !error;
    pendingPlansError = error?.message ?? null;
  }

  const report = {
    project: url,
    anonFoldersWithoutSession: leakedCount,
    anonError: leakErr?.message ?? null,
    rlsLooksOk,
    pendingPlansTable,
    pendingPlansError,
    ok: rlsLooksOk && pendingPlansTable !== false,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!report.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

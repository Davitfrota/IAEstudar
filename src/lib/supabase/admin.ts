import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase/server";

/**
 * Preferência: sessão do usuário (RLS ativo).
 * Service role só com USE_SERVICE_ROLE_DB=true (jobs/admin) ou
 * quando não há cookies de sessão disponíveis.
 */
export async function createDbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const forceService =
    process.env.USE_SERVICE_ROLE_DB === "true" ||
    process.env.USE_SERVICE_ROLE_DB === "1";

  if (forceService && url && serviceKey) {
    return createServiceClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  try {
    return await createServerClient();
  } catch {
    if (url && serviceKey) {
      return createServiceClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    throw new Error(
      "Sem cliente Supabase: configure sessão do usuário ou SUPABASE_SERVICE_ROLE_KEY",
    );
  }
}

/** Service role explícito (migrações, scripts, broadcast admin). */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY ausente — use createDbClient() nas rotas autenticadas",
    );
  }

  return createServiceClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = Awaited<ReturnType<typeof createDbClient>>;

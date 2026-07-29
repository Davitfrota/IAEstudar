import { createDbClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { AppError } from "@/server/http";
import type { AppUser } from "@/server/types";

/** Usuário autenticado via Supabase Auth; garante linha em public.users. */
export async function requireAppUser(): Promise<AppUser> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new AppError("Não autenticado", 401, "UNAUTHORIZED");
  }

  const db = await createDbClient();
  const { data: existing, error: lookupError } = await db
    .from("users")
    .select("id, email")
    .eq("id", user.id)
    .maybeSingle();

  if (lookupError) {
    throw new AppError("Falha ao carregar usuário", 500, "USER_LOOKUP");
  }

  if (existing) {
    return existing as AppUser;
  }

  const { data: created, error: insertError } = await db
    .from("users")
    .insert({ id: user.id, email: user.email ?? null })
    .select("id, email")
    .single();

  if (insertError || !created) {
    throw new AppError("Falha ao sincronizar usuário", 500, "USER_SYNC");
  }

  return created as AppUser;
}

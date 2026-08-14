import type { AdminClient } from "@/lib/supabase/admin";
import { AppError } from "@/server/http";
import type { AppUser } from "@/server/types";

/**
 * Resolve (ou cria) a linha em `users` para um clerk_id.
 * Tolera corrida de inserts paralelos no primeiro login
 * (unique em clerk_id): o perdedor re-seleciona o vencedor.
 */
export async function ensureAppUser(
  db: AdminClient,
  clerkId: string,
  email: string | null,
): Promise<AppUser> {
  const { data: existing, error } = await db
    .from("users")
    .select("id, clerk_id, email")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (error) {
    throw new AppError("Falha ao carregar usuário", 500, "USER_LOOKUP");
  }

  if (existing) {
    return existing as AppUser;
  }

  const { data: created, error: insertError } = await db
    .from("users")
    .insert({ clerk_id: clerkId, email })
    .select("id, clerk_id, email")
    .single();

  if (!insertError && created) {
    return created as AppUser;
  }

  // Corrida típica: /pastas faz Promise.all de várias APIs no 1º load.
  const { data: raced, error: raceError } = await db
    .from("users")
    .select("id, clerk_id, email")
    .eq("clerk_id", clerkId)
    .maybeSingle();

  if (!raceError && raced) {
    return raced as AppUser;
  }

  throw new AppError("Falha ao sincronizar usuário", 500, "USER_SYNC");
}

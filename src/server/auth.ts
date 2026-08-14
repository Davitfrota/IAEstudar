import { auth, currentUser } from "@clerk/nextjs/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureAppUser } from "@/server/ensure-app-user";
import { AppError } from "@/server/http";
import type { AppUser } from "@/server/types";

export async function requireClerkUserId(): Promise<string> {
  const { userId } = await auth();
  if (!userId) {
    throw new AppError("Não autenticado", 401, "UNAUTHORIZED");
  }
  return userId;
}

export { ensureAppUser };

/** Resolve (e se preciso cria) o usuário interno a partir do Clerk. */
export async function requireAppUser(): Promise<AppUser> {
  const clerkId = await requireClerkUserId();
  const supabase = createAdminClient();

  const { data: existing, error } = await supabase
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

  const clerkUser = await currentUser();
  const email =
    clerkUser?.primaryEmailAddress?.emailAddress ??
    clerkUser?.emailAddresses?.[0]?.emailAddress ??
    null;

  return ensureAppUser(supabase, clerkId, email);
}

/** Mensagens amigáveis para erros do Supabase Auth no browser. */
export function mapAuthError(error: unknown): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Falha na autenticação";

  const msg = raw.toLowerCase();

  if (
    msg.includes("failed to fetch") ||
    msg.includes("networkerror") ||
    msg.includes("fetch failed")
  ) {
    return "Não foi possível conectar ao Supabase. Verifique a internet e se o projeto está ativo.";
  }

  if (
    msg.includes("rate limit") ||
    msg.includes("over_email_send_rate_limit") ||
    msg.includes("email rate limit")
  ) {
    return "Limite de e-mails de confirmação atingido. Desative Confirm email no Dashboard do Supabase (Authentication → Providers → Email) para desenvolvimento local, aguarde alguns minutos e tente de novo.";
  }

  if (msg.includes("email address") && msg.includes("invalid")) {
    return "Email inválido. Confira o endereço (ex.: gmail.com, não gmiail.com).";
  }

  if (msg.includes("user already registered")) {
    return "Este email já está cadastrado. Tente entrar.";
  }

  if (msg.includes("email not confirmed")) {
    return "Email ainda não confirmado. Desative a confirmação no Dashboard ou confirme o link enviado.";
  }

  if (msg.includes("invalid login credentials")) {
    return "Email ou senha incorretos.";
  }

  return raw;
}

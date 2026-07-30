# Setup e troubleshooting (Fase 1)

## Setup mínimo

```bash
pnpm install
cp .env.example .env.local
# Preencha as variáveis abaixo
pnpm db:reset   # ou aplique a migration no SQL Editor
pnpm dev
```

### Variáveis

| Variável | Uso |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | Auth web |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` / `SIGN_UP_URL` | Defaults `/sign-in`, `/sign-up` |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente / config |
| `SUPABASE_SERVICE_ROLE_KEY` | **Obrigatória** no server (`createAdminClient`) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | Agente + `generate_form` |
| `IA_ESTUDAR_USER_ID` | Só para `pnpm mcp` (UUID de `users.id`) |

## Banco

Migration: `supabase/migrations/20260728220000_phase1_schema.sql`.

```bash
pnpm db:start    # supabase local
pnpm db:reset    # reaplica migrations
```

Sem CLI: cole a migration no SQL Editor do projeto Supabase.

## Problemas comuns

### `Supabase admin credentials missing`

`NEXT_PUBLIC_SUPABASE_URL` ou `SUPABASE_SERVICE_ROLE_KEY` ausentes no processo Next. Sem service role **nenhuma** API funciona (todas usam admin client).

### `Não autenticado` / redirect para sign-in

Clerk não configurado ou cookies inválidos. Confira as keys e as URLs de sign-in/up no Dashboard Clerk e no `.env.local`.

### RLS / dados vazios no client Supabase

APIs ignoram RLS (service role). Se você consultar o Postgres com anon key + JWT Clerk:

1. Ative Clerk como Third-Party Auth no Supabase.
2. Garanta que `auth.jwt()->>'sub'` = `users.clerk_id`.
3. O usuário precisa existir em `users` (primeiro hit autenticado em `/api/*` faz upsert).

### `ANTHROPIC_API_KEY não configurada` / `AI_NOT_CONFIGURED`

Chat do agente e geração de formulário falham sem a key.

### `DOCUMENT_TOO_SHORT`

`generate_form` exige ≥ 50 caracteres em `content_text`. Documentos criados só com título ficam curtos até o editor salvar texto.

### `Limite de 20 mensagens/hora` / `10 …/dia` / export 1x/dia

Rate limit em memória (`src/server/rate-limit.ts`). Em dev, reiniciar `pnpm dev` zera os buckets. Em produção multi-instância os limites **não** são globais.

### Cronograma pula tópicos (`topicsSkipped`)

Comportamento esperado: 1 tópico/dia no intervalo `[hoje, targetDate]` (ou 14 dias). Tópicos que não cabem são listados em `topicsSkipped`, não comprimidos.

### Formulário `is_stale`

Editar o documento de origem marca forms ligados como stale. Não há regeneração automática — peça ao agente ou regenere via API com confirmação.

### MCP stdio: `IA_ESTUDAR_USER_ID é obrigatório`

O processo stdio não tem sessão Clerk. Passe o UUID interno:

```sql
select id, clerk_id, email from users;
```

### Soft deletes “sumiram” da UI mas ainda no banco

`deleted_at` preenchido; listagens filtram ativos. Export (`GET /api/export`) pode incluir linhas soft-deleted conforme o select atual (sem filtro `deleted_at`).

## Scripts úteis

| Script | Ação |
| --- | --- |
| `pnpm dev` | Next.js |
| `pnpm build` / `pnpm lint` | CI local |
| `pnpm mcp` | servidor MCP stdio |
| `pnpm db:start` / `pnpm db:reset` | Supabase local |

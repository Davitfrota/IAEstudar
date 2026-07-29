# IA Estudar — Fase 1

Plataforma de estudo pessoal: pastas, documentos, cronogramas e formulários (FSRS), operados por um agente MCP.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- Clerk (auth) + Supabase (Postgres, RLS, Realtime)
- Anthropic Messages API + ferramentas MCP in-process
- BlockNote (editor) + ts-fsrs (revisão espaçada)

## Setup

```bash
pnpm install
cp .env.example .env.local
# Preencha Clerk, Supabase e ANTHROPIC_API_KEY
```

### Banco

```bash
npx supabase init   # se ainda não houver config
npx supabase db reset
# ou aplique supabase/migrations/20260728220000_phase1_schema.sql no SQL Editor
```

Configure o Clerk como provedor JWT no Supabase (Third-Party Auth) para que `auth.jwt()->>'sub'` = `clerk_id` e o RLS funcione no client. As rotas `/api/*` usam `SUPABASE_SERVICE_ROLE_KEY` e sempre escopam por `user.id` interno resolvido do Clerk.

### Dev

```bash
pnpm dev
```

Rotas autenticadas: `/pastas`, `/agenda`, `/formularios`, `/agente`.

### MCP stdio (opcional)

```bash
IA_ESTUDAR_USER_ID=<uuid-da-tabela-users> pnpm mcp
```

## Sucesso da Fase 1

No `/agente`, uma instrução em linguagem natural deve popular pasta → documento → cronograma → formulário via tools (`create_folder`, `create_document`, `generate_schedule`, `generate_form`), com preview/confirmação em schedule/form.

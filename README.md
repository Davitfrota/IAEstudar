# IA Estudar

Plataforma de estudo pessoal: pastas, documentos, cronogramas e formulários (FSRS), operados por um agente MCP.

## Stack

- Next.js (App Router) + TypeScript + Tailwind
- **Supabase Auth + Postgres** (RLS com `auth.uid()`)
- **Groq** (OpenAI-compatible) + ferramentas MCP in-process
- BlockNote (editor) + ts-fsrs (revisão espaçada)

## Setup

```bash
pnpm install
cp .env.example .env.local
```

Preencha no `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `GROQ_API_KEY` (e opcionalmente `GROQ_MODEL`, default `llama-3.3-70b-versatile`)
- `SUPABASE_SERVICE_ROLE_KEY` (opcional no server)

No Dashboard Auth, desative **Confirm email** para desenvolvimento local.

### Dev

```bash
pnpm dev
```

Rotas: `/sign-in`, `/sign-up`, `/pastas`, `/agenda`, `/formularios`, `/agente`.

## Fase 2 (UX + E2E do agente)

- Tool MCP `update_document` (com confirmação se sobrescrever)
- Botão **Confirmar** no chat para schedule/form/update
- Realtime na agenda, formulários e árvore de pastas
- Atalhos na prática: Espaço (revelar), 1–4 (Again/Hard/Good/Easy)
- `PATCH /api/folders/[id]` e `confirmed` em `POST /api/schedules`
- Preview de `generate_form` com **estimativa de cards/créditos/custo** + **edição campo a campo** (roadmap RemNote)

## Specs

- [Fase 1](docs/study-platform-fase1-spec.md)
- [RemNote — análise e roadmap](docs/remnote-analise-roadmap.md)
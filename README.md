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

## Fase 2 (UX do agente + interface real)

- Plano consolidado (`ToolPlanCard`) com TTL 10 min + confirm/cancel
- Preview editável de cards + estimativa de custo
- Calendário com drag & drop (`PATCH /api/schedule-items`)
- Fila de prática via `GET /api/practice/queue` + `practice_sessions`
- Autosave BlockNote (`PATCH /api/documents/:id/content`, debounce 2s)
- Atalhos na prática: Espaço / 1–4

## Specs

- [Fase 1](docs/study-platform-fase1-spec.md)
- [Fase 2](docs/study-platform-fase2-spec.md)
- [RemNote — análise e roadmap](docs/remnote-analise-roadmap.md)

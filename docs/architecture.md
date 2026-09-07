# Arquitetura (Fase 1)

## Intento

IA Estudar é uma plataforma de estudo pessoal. Pastas, documentos, cronogramas e formulários (FSRS) são operados pelo usuário na UI e pelo agente MCP. Sucesso da Fase 1: uma instrução em `/agente` popula pasta → documento → cronograma → formulário via tools.

## Stack

| Camada | Tecnologia |
| --- | --- |
| App | Next.js 16 App Router, React 19, Tailwind 4 |
| Auth | Clerk (`clerkMiddleware` + `auth.protect`) |
| Dados | Supabase Postgres + RLS; server usa **service role** |
| IA | Anthropic Messages API (`ANTHROPIC_API_KEY`) |
| Editor | BlockNote |
| Revisão | `ts-fsrs` (`enable_fuzz: true`) |

## Layout do código

```
src/
  app/(app)/          # páginas autenticadas
  app/api/            # rotas HTTP (sempre escopam por user.id interno)
  components/         # UI (AgentChat, FolderTree, PracticeQueue, …)
  lib/supabase/       # createAdminClient (service role)
  middleware.ts       # Clerk; públicas: /, /sign-in, /sign-up
  server/
    auth.ts           # Clerk → users (upsert por clerk_id)
    http.ts           # AppError, ok/fail, parseJson
    schemas/          # Zod (fonte de verdade de validação)
    services/         # regras de negócio
    repositories/     # acesso Supabase
    mcp/              # agente + tools + stdio
    prompts/forms.ts  # system prompts por tipo de formulário
    rate-limit.ts     # buckets em memória (Fase 1)
```

Fluxo típico de mutação:

`route → requireAppUser() → Service → Repository → Supabase (admin)`

## Identidade e autorização

1. Clerk autentica a sessão (`sub` = `clerk_id`).
2. `requireAppUser()` resolve (ou cria) a linha em `users` e devolve UUID interno.
3. APIs e tools MCP usam **sempre** esse `user.id` — nunca aceitam `userId` do payload.
4. RLS no Postgres usa `current_app_user_id()` (`clerk_id = auth.jwt()->>'sub'`).

**Importante:** as rotas `/api/*` usam `SUPABASE_SERVICE_ROLE_KEY` e **não** passam pelo JWT do Clerk no Postgres. O isolamento depende do escopo explícito por `user_id` nos services/repositories. O RLS protege acesso via anon key / cliente autenticado Clerk↔Supabase (Third-Party Auth).

Para o RLS client-side funcionar, configure Clerk como provedor JWT no Supabase (Third-Party Auth) de modo que `auth.jwt()->>'sub'` = `clerk_id`.

## Domínio de dados

| Entidade | Notas |
| --- | --- |
| `folders` / `documents` | Soft delete (`deleted_at`). Conteúdo BlockNote em `content` (JSONB) + `content_text` |
| `study_schedules` / `schedule_items` | 1 tópico por dia; itens com status `pending\|done\|skipped` |
| `forms` / `form_questions` | Form sempre tem `source_document_id`. Tipos de form: `flashcard_deck`, `quiz`, `open_form` |
| `form_reviews` | Append-only (triggers bloqueiam UPDATE/DELETE) |
| `agent_actions` | Auditoria de cada tool call |
| `conversations` / `conversation_messages` | Histórico do chat (últimas 40 msgs no agente) |

Mapeamento form → tipo de questão gerada: `flashcard_deck`→`qa`, `quiz`→`multiple_choice`, `open_form`→`open`. O schema SQL também permite `cloze`, mas o gerador da Fase 1 não o produz.

Trigger `documents_mark_forms_stale`: ao mudar `content`/`content_text`, formulários ligados ficam `is_stale = true` (sem regeneração automática).

Realtime (publication): `schedule_items`, `forms`, `form_questions`.

## Rate limits (memória local)

Definidos em `src/server/rate-limit.ts`. **Não compartilham estado entre instâncias serverless** — trocar por Redis em produção.

| Operação | Limite |
| --- | --- |
| Agent chat | 20 msgs / hora / usuário |
| `generate_schedule` / `generate_form` | 10 / dia / usuário / tool |
| Export | 1 / dia / usuário |

## Respostas HTTP

Sucesso: `{ data: … }`  
Erro: `{ error: { message, code, details? } }` (`AppError`, `ZodError` → `VALIDATION_ERROR`, resto → `INTERNAL`).

Códigos frequentes: `UNAUTHORIZED`, `RATE_LIMIT`, `DOCUMENT_TOO_SHORT`, `DOCUMENT_NOT_FOUND`, `FORM_NOT_FOUND`, `QUESTION_NOT_FOUND`, `INSUFFICIENT_TOPICS`, `AI_NOT_CONFIGURED`, `AI_EMPTY_RESULT`.

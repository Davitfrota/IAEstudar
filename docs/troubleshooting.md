# Setup e troubleshooting (Fase 1)

Escopo: `main` Fase 1 (`00966ff`, reverificado 2026-10-19). Sintomas abaixo refletem o código atual, não PRs de fix ainda em draft.

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
| `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto (obrigatória no server) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Presente no `.env.example`; **não usada** em `src/` na Fase 1 |
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

Clerk não configurado ou cookies inválidos. Confira as keys e as URLs de sign-in/up no Dashboard Clerk e no `.env.local`. Rotas públicas no middleware: `/`, `/sign-in`, `/sign-up`.

### `USER_SYNC` no primeiro login

`requireAppUser` faz lookup + insert sem tratamento de corrida. Dois requests paralelos no primeiro login podem falhar no insert único de `clerk_id` — retry costuma resolver.

### RLS / dados vazios no client Supabase

APIs ignoram RLS (service role). Se você consultar o Postgres com anon key + JWT Clerk:

1. Ative Clerk como Third-Party Auth no Supabase.
2. Garanta que `auth.jwt()->>'sub'` = `users.clerk_id`.
3. O usuário precisa existir em `users` (primeiro hit autenticado em `/api/*` faz upsert).

### `ANTHROPIC_API_KEY não configurada` / `AI_NOT_CONFIGURED`

Chat do agente e geração de formulário falham sem a key.

### `AI_EMPTY_RESULT`

A resposta da Anthropic em `generate_form` não trouxe JSON com `questions` utilizável. Retry ou ajuste a instrução / conteúdo do documento.

### `DOCUMENT_TOO_SHORT`

`generate_form` exige ≥ 50 caracteres em `content_text`. Documentos criados só com título ficam curtos até o editor salvar texto.

Também pode acontecer com docs “visualmente longos” se o texto estiver só em listas aninhadas ou tabelas: o autosave do `DocumentEditor` grava `contentText` raso (`block.content[].text` no nível raiz). Ver `content_text` em [architecture.md](./architecture.md).

### `INSUFFICIENT_TOPICS`

Código defensivo quando `topicsFitting.length === 0`. Com o schema atual (`topics.min(1)` + `dayCount >= 1`) quase não dispara — o caso comum de overflow é `topicsSkipped`, não este erro.

### `Limite de 20 mensagens/hora` / `10 …/dia` / export 1x/dia

Rate limit em memória (`src/server/rate-limit.ts`). Em dev, reiniciar `pnpm dev` zera os buckets. Em produção multi-instância os limites **não** são globais. Preview de form/schedule via MCP (`confirmed=false`) não conta; `POST /api/schedules` HTTP sempre conta.

### Cronograma pula tópicos (`topicsSkipped`)

Comportamento esperado: 1 tópico/dia no intervalo `[hoje, targetDate]` (ou 14 dias). Tópicos que não cabem são listados em `topicsSkipped`, não comprimidos.

### `POST /api/schedules` criou sem eu confirmar

Esperado na Fase 1: só o MCP/agente tem preview de cronograma. A rota HTTP persiste na hora (e conta no rate limit 10/dia).

### Formulário `is_stale`

Editar o documento de origem marca forms ligados como stale. Não há regeneração automática — peça ao agente ou regenere via API com confirmação.

### `GET /api/forms/:id` “faltam questões”

A rota devolve a **fila due** (`listDueForForm`), não o deck completo. Questões futuras (fora de `fsrs_due`) não aparecem na prática.

### Soft deletes “sumiram” da UI mas ainda no banco

`deleted_at` preenchido; listagens filtram ativos. Soft delete **não cascateia** (pasta→filhos, documento→forms, form→questões). Export (`GET /api/export`) inclui linhas soft-deleted, não pagina e **omite** conversas. Não há endpoint para soft-deletar cronogramas (`deleted_at` no schema fica sempre null via API). Hard `ON DELETE CASCADE` no SQL é irrelevante enquanto as rotas só fazem soft delete.

### Árvore de `/pastas` não mostra pasta/doc que o agente acabou de criar

Esperado na Fase 1: `onToolCallPreview` (que chama `load()`) só roda em `pending_confirmation`. `create_folder` / `create_document` executam sem preview — use o botão “Atualizar”.

### Agenda / export “corta” itens antigos

`GET /api/schedules` e `GET /api/export` não paginam no app. O PostgREST do Supabase pode aplicar `max_rows` (default comum: 1000) e truncar a resposta sem erro HTTP. Pastas/docs na UI já têm teto explícito de 50 por request e a página não pagina.

### `list_due` com `folderId` devolve poucos itens

A query busca até 100 dues globais e só depois filtra a pasta em JS — dues de outras pastas “consomem” o limite.

### Agente “esqueceu” o turno / confirmação

- Histórico: `limit(40)` + `order asc` = 40 mensagens **mais antigas**; conversas longas podem omitir a mensagem atual do prompt.
- `tool_calls` não é persistido nos inserts do assistente nem reenviado no rebuild — confirmação depende de o modelo re-emitir a tool com `confirmed=true` a partir do texto.
- UI não envia `confirmToolCallId` (campo só existe no Zod).

### FSRS “pulou” learning steps

`learning_steps` do `ts-fsrs` não é salvo no Postgres; cada review reconstrói o card a partir de `createEmptyCard` + colunas FSRS persistidas.

### MCP stdio: `IA_ESTUDAR_USER_ID é obrigatório`

O processo stdio não tem sessão Clerk. Passe o UUID interno:

```sql
select id, clerk_id, email from users;
```

## Scripts úteis

| Script | Ação |
| --- | --- |
| `pnpm dev` | Next.js |
| `pnpm build` / `pnpm lint` | CI local |
| `pnpm mcp` | servidor MCP stdio |
| `pnpm db:start` / `pnpm db:reset` | Supabase local |

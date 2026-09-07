# API HTTP (Fase 1)

Todas as rotas (exceto páginas públicas) exigem sessão Clerk. O handler chama `requireAppUser()` e escopa por `user.id` interno.

Validação: schemas em `src/server/schemas/index.ts`.

## Pastas

| Método | Path | Body / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/api/folders` | `cursor?`, `limit?` (1–50, default 50) | `{ folders }` |
| `POST` | `/api/folders` | `{ name, parentFolderId? }` | `{ folder }` 201 |
| `DELETE` | `/api/folders/:id` | — | `{ deleted: true }` (soft) |

`name`: 1–200 chars. `parentFolderId`: UUID opcional.

## Documentos

| Método | Path | Body / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/api/documents` | `cursor?`, `limit?` | `{ documents }` |
| `POST` | `/api/documents` | `{ title, folderId?, initialContent?, content? }` | `{ document }` 201 |
| `GET` | `/api/documents/:id` | — | `{ document }` |
| `PATCH` | `/api/documents/:id` | `{ title?, folderId?, content?, contentText? }` | `{ document }` |
| `DELETE` | `/api/documents/:id` | — | `{ deleted: true }` (soft) |

`initialContent` vira parágrafo BlockNote + `content_text`. No `PATCH`, se `content` for enviado sem `contentText`, o server recalcula texto plano via `extractContentText`.

## Cronogramas

| Método | Path | Body / query | Resposta |
| --- | --- | --- | --- |
| `GET` | `/api/schedules` | `from?`, `to?` (filtro de itens) | `{ schedules, items }` |
| `POST` | `/api/schedules` | ver abaixo | `{ scheduleId, itemsCreated, topicsSkipped, items }` 201 |

Body de geração:

```json
{
  "title": "Prova de Cálculo",
  "topics": ["Limites", "Derivadas", "Integrais"],
  "targetDate": "2026-08-15",
  "dailyMinutes": 30
}
```

- `topics`: ≥ 1 string não vazia.
- `targetDate`: opcional (`YYYY-MM-DD`); se presente, não pode ser no passado. Sem data → janela de 14 dias (hoje + 13).
- `dailyMinutes`: 15–480, default 30.
- Distribuição: **1 tópico por dia**. Excedentes → `topicsSkipped` (não comprime sessões).
- Se nenhum tópico couber no intervalo → `400 INSUFFICIENT_TOPICS`.
- Rate limit: 10/dia (`assertGenerateRateLimit`).
- `created_by` do schedule persistido: `agent` (mesmo via HTTP).

## Formulários

| Método | Path | Body | Resposta |
| --- | --- | --- | --- |
| `GET` | `/api/forms` | — | `{ forms, dueCount }` |
| `POST` | `/api/forms` | ver abaixo | preview ou create |
| `GET` | `/api/forms/:id` | — | `{ form, questions }` — **fila due** do form (prática), não todas as questões |
| `DELETE` | `/api/forms/:id` | — | `{ deleted: true }` (soft) |
| `POST` | `/api/forms/review` | `{ formQuestionId, rating }` | `{ nextDue, newState }` |

Geração:

```json
{
  "sourceDocumentId": "<uuid>",
  "type": "flashcard_deck",
  "instruction": "Foque em definições",
  "questionCount": 10,
  "confirmed": false
}
```

- `type`: `flashcard_deck` \| `quiz` \| `open_form`
- `instruction`: 1–2000 chars
- `questionCount`: 1–50, default 10
- `confirmed: false` (default) → preview sem persistir e **sem** chamar Anthropic (`DOCUMENT_TOO_SHORT` se `content_text` < 50 chars)
- `confirmed: true` → gera via Anthropic e persiste (rate limit 10/dia). Conteúdo do doc truncado a **12 000** chars no prompt.
- Tipos de questão criados: `qa` / `multiple_choice` / `open` conforme o tipo do form.

Ratings FSRS: `again` \| `hard` \| `good` \| `easy`.

## Agente

| Método | Path | Body | Resposta |
| --- | --- | --- | --- |
| `POST` | `/api/agent/chat` | `{ message, conversationId? }` | NDJSON stream |

- `message`: 1–8000 chars.
- `confirmToolCallId` existe no schema Zod, mas **não é usado** pelo handler atual — confirmação é via nova mensagem + tool com `confirmed=true`.

Detalhes: [agent-mcp.md](./agent-mcp.md).

## Export

| Método | Path | Resposta |
| --- | --- | --- |
| `GET` | `/api/export` | dump JSON do usuário |

Shape de `data`:

```json
{
  "exportedAt": "<ISO>",
  "user": { "id": "<uuid>", "clerk_id": "…", "email": "…" },
  "folders": [],
  "documents": [],
  "study_schedules": [],
  "schedule_items": [],
  "forms": [],
  "form_questions": [],
  "form_reviews": [],
  "agent_actions": []
}
```

Selects **não** filtram `deleted_at` — soft-deleted entram no dump. Rate limit: **1x/dia**.

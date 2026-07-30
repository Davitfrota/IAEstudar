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

`initialContent` vira parágrafo BlockNote + `content_text`. Atualizar `content` recalcula `content_text` se `contentText` não for enviado.

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
- Rate limit: 10/dia.

## Formulários

| Método | Path | Body | Resposta |
| --- | --- | --- | --- |
| `GET` | `/api/forms` | — | `{ forms, dueCount }` |
| `POST` | `/api/forms` | ver abaixo | preview ou create |
| `GET` | `/api/forms/:id` | — | `{ form, questions }` (fila due do form) |
| `DELETE` | `/api/forms/:id` | — | `{ deleted: true }` |
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
- `questionCount`: 1–50, default 10
- `confirmed: false` (default) → preview sem persistir / sem chamar IA de geração completa
- `confirmed: true` → gera via Anthropic e persiste (rate limit 10/dia)
- Documento precisa de ≥ **50** chars em `content_text` (`DOCUMENT_TOO_SHORT`)

Ratings FSRS: `again` \| `hard` \| `good` \| `easy`.

## Agente

| Método | Path | Body | Resposta |
| --- | --- | --- | --- |
| `POST` | `/api/agent/chat` | `{ message, conversationId? }` | NDJSON stream |

Detalhes: [agent-mcp.md](./agent-mcp.md).

## Export

| Método | Path | Resposta |
| --- | --- | --- |
| `GET` | `/api/export` | dump JSON do usuário (folders, documents, schedules, forms, reviews, agent_actions) |

Rate limit: **1x/dia**.

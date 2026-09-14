# Agente MCP (Fase 1)

## Intento

O agente traduz linguagem natural em mutações tipadas (pastas, docs, cronogramas, forms, revisões). As mesmas tools rodam:

1. **In-process** no web (`runAgentChat` → `executeMcpTool`)
2. **stdio** via `pnpm mcp` (Cursor / Claude Desktop)

Código: `src/server/mcp/{agent,tools,stdio-server}.ts`.

## Chat HTTP (streaming NDJSON)

`POST /api/agent/chat`

```json
{ "message": "Crie uma pasta de Cálculo e um cronograma até sexta", "conversationId": "<uuid opcional>" }
```

Headers de resposta: `Content-Type: application/x-ndjson; charset=utf-8`. Uma linha JSON por evento:

| Campo | Significado |
| --- | --- |
| `conversationId` | Criado ou revalidado (sempre do usuário autenticado) |
| `textDelta` | Trecho de texto do assistente |
| `toolCall` | `{ name, input, status, result?, error? }` — `status`: `pending_confirmation` \| `executed` \| `error` |
| `done` | `true` ao finalizar |
| `error` | Mensagem de falha no stream |

Constraints do loop (`runAgentChat`):

- Rate limit 20 msgs/hora
- Até **6** turnos tool↔modelo por request
- Histórico: `order(created_at asc).limit(40)` — com conversas longas isso carrega as **40 mais antigas**, não as mais recentes (o turno atual pode ficar de fora do prompt)
- Só roles `user`/`assistant` entram no prompt; coluna `tool_calls` é lida mas **não** é reenviada à Anthropic; inserts do agente não gravam `tool_calls`
- Modelo: `ANTHROPIC_MODEL` ou `claude-sonnet-4-20250514`
- `max_tokens`: 4096 (turno normal) / 1024 (follow-up após pending)
- `userId` só do contexto autenticado; system prompt proíbe pedir/aceitar userId

Confirmação: para `generate_schedule` / `generate_form`, o agente deve chamar com `confirmed=false`, explicar o preview e só persistir após o usuário confirmar (`confirmed=true`). Com pending, o loop faz um follow-up textual e **para** (aguarda a próxima mensagem do usuário).

UI (`AgentChat`): não há botão de confirmar nem envio de `confirmToolCallId` — o usuário confirma em linguagem natural na próxima mensagem. Evento `{ done: true }` é emitido pelo server e ignorado pelo client.

## Tools

Todas passam por `withAudit` → `agent_actions`. Resultado: `{ status, data?, error? }`. Falhas no handler são capturadas pelo audit e devolvidas como `status: "error"` (não rethrow).

### `create_folder`

```json
{ "name": "Cálculo I", "parentFolderId": "<uuid?>" }
```

→ `{ folderId }`

### `create_document`

```json
{ "title": "Limites", "folderId": "<uuid?>", "initialContent": "…" }
```

→ `{ documentId }`

(Zod também aceita `content`, mas o schema MCP exposto lista só `title`, `folderId`, `initialContent`.)

### `generate_schedule`

```json
{
  "title": "Prova",
  "topics": ["A", "B", "C"],
  "targetDate": "2026-08-15",
  "dailyMinutes": 30,
  "confirmed": false
}
```

- `confirmed=false` → `pending_confirmation` + preview (sem rate limit de generate)
- `confirmed=true` → persiste (1 tópico/dia; excedentes em `topicsSkipped`)

### `generate_form`

```json
{
  "sourceDocumentId": "<uuid>",
  "type": "quiz",
  "instruction": "…",
  "questionCount": 10,
  "confirmed": false
}
```

- Preview exige doc ≥ 50 chars em `content_text` (sem Anthropic)
- Persistência chama Anthropic (conteúdo truncado a 12 000 chars) e cria questões tipadas por form (`qa` / `multiple_choice` / `open`)

### `record_review`

```json
{ "formQuestionId": "<uuid>", "rating": "good" }
```

→ `{ nextDue, newState }` + insert imutável em `form_reviews`

### `list_due`

```json
{ "date": "<ISO datetime?>", "folderId": "<uuid?>" }
```

→ `{ questions }` com `fsrs_due <= date|agora` (até 100; `folderId` filtrado em JS)

## MCP stdio

```bash
# Resolve o UUID interno em users (não o clerk_id)
IA_ESTUDAR_USER_ID=<uuid> pnpm mcp
```

Requer também credenciais Supabase admin no ambiente (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) e, para `generate_form`, `ANTHROPIC_API_KEY`.

Exemplo de config MCP (Cursor):

```json
{
  "mcpServers": {
    "ia-estudar": {
      "command": "pnpm",
      "args": ["mcp"],
      "cwd": "/caminho/para/IAEstudar",
      "env": {
        "IA_ESTUDAR_USER_ID": "…",
        "NEXT_PUBLIC_SUPABASE_URL": "…",
        "SUPABASE_SERVICE_ROLE_KEY": "…",
        "ANTHROPIC_API_KEY": "…"
      }
    }
  }
}
```

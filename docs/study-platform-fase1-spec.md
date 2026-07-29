# Feature Spec — Plataforma de Estudo Pessoal (Fase 1: Camada de Dados + Agente MCP)

## Objetivo

A Fase 1 estabelece a fundação sobre a qual o agente de IA vai operar: pastas e documentos (onde o conteúdo de estudo vive), cronogramas (quando estudar o quê) e formulários — decks de flashcard, quiz ou forma aberta — gerados a partir de documentos específicos. Resolve o problema de fragmentação entre "onde eu guardo minhas anotações", "quando eu devo revisar" e "como eu testo se aprendi", hoje espalhado entre Notion, Anki e planner manual. O usuário interage principalmente através de um agente conversacional: descreve o que precisa estudar e até quando, e o agente cria pasta, documento, cronograma e formulário sozinho, chamando ferramentas MCP escopadas. Sucesso da Fase 1 = a partir de uma única instrução em linguagem natural, o agente popula um estado coerente no banco (pasta → documento → cronograma → formulário) sem intervenção manual do usuário em nenhuma etapa.

## Regras de Produto

```
Regras de negócio:
- [ ] Todo dado (pasta, documento, cronograma, formulário) pertence a exatamente um usuário — sem compartilhamento na Fase 1
- [ ] Um formulário sempre referencia um documento de origem (source_document_id) — não existe formulário "solto"
- [ ] O agente nunca sobrescreve conteúdo existente sem confirmação explícita do usuário
- [ ] Cronogramas com target_date no passado não podem ser criados
- [ ] Uma revisão (form_review) é sempre um evento imutável — nunca editado, só inserido

Permissões:
- [ ] Usuário: CRUD completo apenas dos próprios dados
- [ ] Agente (via MCP): mesmas permissões do usuário que iniciou a sessão, nunca mais — sem "super usuário"

Validações:
- [ ] Nome de pasta/documento: 1–200 caracteres
- [ ] generate_form: documento de origem não pode estar vazio (mín. 50 caracteres em content_text)
- [ ] generate_schedule: pelo menos 1 tópico; target_date opcional, mas se presente deve ser futura

Edge cases:
- [ ] Documento editado depois que um formulário foi gerado a partir dele → formulário fica com is_stale = true, sem regeneração automática
- [ ] Agente sem tópicos suficientes pro intervalo de tempo pedido → retorna erro pedindo mais contexto, não inventa tópico
```

## Frontend

### Estrutura de Página
```
/app (layout autenticado)
├── /pastas
│   ├── page.tsx                    — árvore de pastas + documentos
│   └── [documentId]/page.tsx       — editor do documento (BlockNote)
├── /agenda
│   └── page.tsx                    — calendário dos schedule_items
├── /formularios
│   ├── page.tsx                    — lista de formulários + contagem de cards due
│   └── [formId]/practice/page.tsx  — modo de prática (fila FSRS)
└── /agente
    └── page.tsx                    — chat com o agente (onde a Fase 1 acontece de fato)
```

### Componentes
```typescript
<FolderTree
  folders: Folder[]
  documents: Document[]
  onSelect: (id: string, type: 'folder' | 'document') => void
/>

<DocumentEditor
  document: Document
  onChange: (content: BlockNoteContent) => void   // autosave debounced
  isStale?: boolean                                // aviso: formulários vinculados desatualizados
/>

<ScheduleCalendar
  items: ScheduleItem[]
  view: 'week' | 'month'
  onItemClick: (item: ScheduleItem) => void
/>

<PracticeQueue
  formId: string
  questions: FormQuestion[]     // já filtradas por fsrs_due <= now()
  onRate: (questionId: string, rating: FsrsRating) => void
/>

<AgentChat
  onToolCallPreview: (tool: string, input: unknown) => void
  // renderiza o que o agente VAI criar antes de persistir — ver seção Segurança
/>
```

### Estados
```
loading: skeleton na árvore de pastas e no calendário

empty:
  - Sem pastas: EmptyState "Comece pedindo pro agente organizar sua primeira matéria"
  - Sem cards due: EmptyState "Tudo revisado por hoje" (estado de sucesso, não de erro)

success: toast "Documento criado" / "Cronograma gerado com N sessões" / "Formulário pronto com N cards"

error:
  - generate_form recusado (documento vazio): alert inline explicando o motivo
  - Falha de rede no meio de uma prática: resposta do usuário não se perde, retry automático

optimistic update: criar pasta/documento aparece na árvore antes da confirmação do servidor
```

### Responsividade
```
Mobile (<768px): editor em tela cheia; calendário vira lista por dia; prática de flashcard é
  fluxo prioritário (botões grandes again/hard/good/easy, thumb-friendly)
Desktop (>1024px): três colunas — árvore de pastas | editor | chat do agente
```

### Comportamento UX
```
N/A nesta fase — atalhos de teclado e animação ficam pra Fase 2.
Foco da Fase 1 é o agente funcionar ponta a ponta, não polimento de interação.
```

## Backend

### Endpoints

CRUD padrão em `/api/folders`, `/api/documents`, `/api/schedules`, `/api/forms` (mesmo padrão de
payload/validação/response Zod dos seus outros projetos). O endpoint que importa nesta fase é o
que expõe o agente:

#### POST /api/agent/chat
```
Propósito: canal de conversa com o agente; internamente chama a API da Anthropic com as
ferramentas MCP registradas (ver seção seguinte)

Payload:
{
  message: string
  conversationId?: string
}

Response 200 (streaming):
{
  textDelta?: string
  toolCall?: { name: string, input: unknown, status: 'pending_confirmation' | 'executed' }
}

Autorização: Clerk JWT — userId injetado no contexto de toda tool call, nunca aceito do payload
Rate limit: 20 mensagens/hora no plano free (chamadas de IA têm custo real)
```

---

## Agente de IA — Ferramentas MCP

Servidor MCP junto ao backend (`@modelcontextprotocol/sdk`), inputs validados por Zod, cada
handler segue Controller → Service → Repository como o resto do seu código. `userId` vem sempre
do contexto de sessão autenticada — nunca de um campo do input. Isso impede o agente de agir como
outro usuário mesmo se alucinar um ID.

```typescript
create_folder
  input:  { name: string, parentFolderId?: string }
  output: { folderId: string }

create_document
  input:  { title: string, folderId?: string, initialContent?: string }
  output: { documentId: string }

generate_schedule
  input:  { title: string, topics: string[], targetDate?: string, dailyMinutes?: number }
  output: { scheduleId: string, itemsCreated: number }
  // distribui topics entre hoje e targetDate; sem targetDate, cria os próximos 14 dias

generate_form
  input:  {
    sourceDocumentId: string
    type: 'flashcard_deck' | 'quiz' | 'open_form'
    instruction: string          // "como deve ser estruturado", dado pelo usuário
    questionCount?: number       // default 10
  }
  output: { formId: string, questionsCreated: number }
  // seleciona o system prompt do tipo (padrão fixo do sistema — ver nota abaixo), injeta
  // content_text do documento + instruction, força output estruturado via JSON Schema,
  // insere form_questions

record_review
  input:  { formQuestionId: string, rating: 'again' | 'hard' | 'good' | 'easy' }
  output: { nextDue: string, newState: FsrsCardState }
  // roda ts-fsrs scheduler.next(), grava form_reviews (imutável), atualiza form_questions

list_due
  input:  { date?: string, folderId?: string }
  output: { questions: FormQuestionSummary[] }
```

**Nota sobre os prompts por método de estudo:** cada `type` de `generate_form` mapeia pra um
system prompt fixo versionado em código (`PROMPT_FLASHCARD_DECK`, `PROMPT_QUIZ`,
`PROMPT_OPEN_FORM`) — é o "padrão que já teríamos no sistema" que você mencionou. O usuário só
fornece `instruction` (ex: "foca em datas e nomes, não em conceito"). Não vale criar uma tabela
de templates configurável já na Fase 1 — isso é infraestrutura fictícia até existir um segundo
método de verdade pedindo por ela (ver Escalabilidade Futura).

Toda chamada grava uma linha em `agent_actions` (auditoria). Ferramentas que apagam dado
(`delete_folder`, `delete_document`) ficam **fora da Fase 1 de propósito** — exclusão continua
manual pela UI com modal de confirmação até existir um fluxo de confirmação explícita no chat.

## Database

### Tabelas

#### folders
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id           UUID NOT NULL REFERENCES users(id)
parent_folder_id  UUID REFERENCES folders(id)
name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200)
position          INTEGER NOT NULL DEFAULT 0
created_at        TIMESTAMPTZ DEFAULT now()
updated_at        TIMESTAMPTZ DEFAULT now()
deleted_at        TIMESTAMPTZ

INDEXES:
  idx_folders_user_parent ON folders(user_id, parent_folder_id) WHERE deleted_at IS NULL
```

#### documents
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id       UUID NOT NULL REFERENCES users(id)
folder_id     UUID REFERENCES folders(id)
title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200)
content       JSONB NOT NULL DEFAULT '[]'    -- blocos do BlockNote
content_text  TEXT NOT NULL DEFAULT ''       -- extração plana, contexto pro agente + busca
position      INTEGER NOT NULL DEFAULT 0
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ

INDEXES:
  idx_documents_folder ON documents(folder_id) WHERE deleted_at IS NULL
  idx_documents_user ON documents(user_id) WHERE deleted_at IS NULL
```

#### study_schedules
```sql
id            UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id       UUID NOT NULL REFERENCES users(id)
title         TEXT NOT NULL
target_date   DATE
status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'archived'))
created_by    TEXT NOT NULL DEFAULT 'agent' CHECK (created_by IN ('user', 'agent'))
created_at    TIMESTAMPTZ DEFAULT now()
updated_at    TIMESTAMPTZ DEFAULT now()
deleted_at    TIMESTAMPTZ
```

#### schedule_items
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
schedule_id       UUID NOT NULL REFERENCES study_schedules(id)
user_id           UUID NOT NULL REFERENCES users(id)     -- denormalizado, simplifica RLS
folder_id         UUID REFERENCES folders(id)
document_id       UUID REFERENCES documents(id)
scheduled_date    DATE NOT NULL
duration_minutes  INTEGER NOT NULL DEFAULT 30
status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done', 'skipped'))
position          INTEGER NOT NULL DEFAULT 0
created_at        TIMESTAMPTZ DEFAULT now()
updated_at        TIMESTAMPTZ DEFAULT now()

INDEXES:
  idx_schedule_items_user_date ON schedule_items(user_id, scheduled_date)
  idx_schedule_items_schedule ON schedule_items(schedule_id, scheduled_date)
```

#### forms
```sql
id                      UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id                 UUID NOT NULL REFERENCES users(id)
source_document_id      UUID REFERENCES documents(id)
schedule_item_id        UUID REFERENCES schedule_items(id)
title                   TEXT NOT NULL
type                    TEXT NOT NULL CHECK (type IN ('flashcard_deck', 'quiz', 'open_form'))
generation_instruction  TEXT             -- instrução original do usuário pro agente
is_stale                BOOLEAN NOT NULL DEFAULT false
created_at              TIMESTAMPTZ DEFAULT now()
updated_at              TIMESTAMPTZ DEFAULT now()
deleted_at              TIMESTAMPTZ
```

#### form_questions
```sql
id                    UUID PRIMARY KEY DEFAULT gen_random_uuid()
form_id               UUID NOT NULL REFERENCES forms(id)
type                  TEXT NOT NULL CHECK (type IN ('qa', 'cloze', 'multiple_choice', 'open'))
prompt                TEXT NOT NULL
answer                TEXT NOT NULL
choices               JSONB                -- distratores, só multiple_choice
position              INTEGER NOT NULL DEFAULT 0
-- estado FSRS (mapeia direto pro Card do ts-fsrs)
fsrs_state            TEXT NOT NULL DEFAULT 'new' CHECK (fsrs_state IN ('new','learning','review','relearning'))
fsrs_due              TIMESTAMPTZ NOT NULL DEFAULT now()
fsrs_stability        REAL
fsrs_difficulty       REAL
fsrs_elapsed_days     INTEGER NOT NULL DEFAULT 0
fsrs_scheduled_days   INTEGER NOT NULL DEFAULT 0
fsrs_reps             INTEGER NOT NULL DEFAULT 0
fsrs_lapses           INTEGER NOT NULL DEFAULT 0
fsrs_last_review      TIMESTAMPTZ
created_at            TIMESTAMPTZ DEFAULT now()
updated_at            TIMESTAMPTZ DEFAULT now()
deleted_at            TIMESTAMPTZ

INDEXES:
  idx_form_questions_form ON form_questions(form_id) WHERE deleted_at IS NULL
  idx_form_questions_due ON form_questions(fsrs_due) WHERE deleted_at IS NULL
```

#### form_reviews
```sql
id                UUID PRIMARY KEY DEFAULT gen_random_uuid()
form_question_id  UUID NOT NULL REFERENCES form_questions(id)
user_id           UUID NOT NULL REFERENCES users(id)
rating            TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy'))
state_before      JSONB NOT NULL
state_after       JSONB NOT NULL
reviewed_at       TIMESTAMPTZ DEFAULT now()

INDEXES:
  idx_form_reviews_question ON form_reviews(form_question_id, reviewed_at DESC)
```
*Imutável — nunca UPDATE, só INSERT. Alimenta o otimizador de parâmetros do FSRS no futuro
(`@open-spaced-repetition/binding`, ver Escalabilidade Futura).*

#### agent_actions
```sql
id          UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id     UUID NOT NULL REFERENCES users(id)
tool_name   TEXT NOT NULL
input       JSONB NOT NULL
output      JSONB
status      TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending_confirmation'))
created_at  TIMESTAMPTZ DEFAULT now()

INDEXES:
  idx_agent_actions_user ON agent_actions(user_id, created_at DESC)
```
*Auditoria — toda ferramenta MCP grava aqui antes de retornar ao agente.*

> `users` não está definida aqui — assume-se a tabela padrão sincronizada com Clerk que você já
> usa nos outros projetos.

## Segurança

```
Autenticação: Clerk JWT em todas as rotas, incluindo /api/agent/chat

Autorização:
  - RLS no Supabase: toda tabela filtrada por user_id = auth.uid()
  - Ferramentas MCP nunca recebem user_id como parâmetro vindo do agente — sempre injetado
    pelo contexto de sessão autenticada
  - Nenhuma ferramenta MCP executa SQL livre; cada uma chama um Service tipado com escopo fixo
    (nada de "dar acesso total ao banco pro agente")

Confirmação:
  - generate_schedule e generate_form: preview antes de persistir — o agente mostra o que vai
    criar, usuário confirma ou ajusta (isso é o que AgentChat.onToolCallPreview renderiza)
  - Exclusão: fora do MCP na Fase 1, só manual via UI com modal de confirmação

Rate limiting:
  - /api/agent/chat: 20 mensagens/hora no free (chamadas de IA têm custo real)
  - generate_form / generate_schedule: máx. 10/dia por usuário na Fase 1

LGPD:
  - content e content_text são dados pessoais do usuário — nunca usados pra treinar modelo,
    nunca expostos em log de erro
  - Export de dados: endpoint dedicado (JSON de tudo que o usuário tem), rate limit 1x/dia
  - Exclusão de conta: hard delete de tudo em até 30 dias, incluindo agent_actions
```

## Realtime / Eventos

```
Supabase Realtime:
  - Canal schedule:{userId} — calendário atualiza ao vivo quando o agente cria schedule_items
  - Canal forms:{userId} — contador de "due" atualiza sem refetch

Jobs (fora da Fase 1):
  - recalculate-stale-forms: ao editar um documento, marca formulários vinculados como is_stale
```

## Performance

```
Cache:
  - Contagem de cards due por usuário: Redis, invalidado a cada record_review

Paginação:
  - Lista de documentos/pastas: cursor-based, 50 por página

Query optimization:
  - idx_form_questions_due é o índice mais quente do sistema (roda toda vez que abre "praticar")
  - content_text fica denormalizado justamente pra não parsear JSONB toda vez que o agente
    monta contexto pra gerar um formulário
```

## Edge Cases

```
Documento editado após geração de formulário:
  → is_stale = true, próxima abertura mostra aviso, sem regeneração automática (usuário decide)

Agente tenta generate_form em documento vazio/curto demais:
  → validação recusa antes de chamar a IA — evita gastar créditos com resultado ruim

target_date no passado em generate_schedule:
  → rejeitado no Zod, agente pede a data de novo

Cronograma sem dias suficientes pros tópicos pedidos:
  → agente distribui o que cabe e avisa quais tópicos ficaram de fora, não comprime tudo em
    sessões inviáveis
```

## Escalabilidade Futura

```
Ver remnote-analise-roadmap.md pro mapeamento completo. Prioridades mais próximas:
- Backlinks/portais entre documentos (referenciar um conceito em vários lugares sem duplicar)
- AI Tutor contextual durante a prática — não só gerar card, ajudar a entender o erro
- Compressão de agenda perto da data de prova (hoje o schema já suporta target_date, falta a
  lógica de redistribuir mais denso conforme a data se aproxima)
- Otimização de parâmetros FSRS por usuário via @open-spaced-repetition/binding, treinando
  com o histórico acumulado em form_reviews
- Tabela de prompt templates configurável — só depois de ter um 2º método de verdade pedindo
```

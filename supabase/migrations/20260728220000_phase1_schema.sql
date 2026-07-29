-- Fase 1: pastas, documentos, cronogramas, formulários, FSRS, auditoria do agente

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Usuários sincronizados com Clerk (clerk_id = sub do JWT)
CREATE TABLE IF NOT EXISTS users (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id    TEXT NOT NULL UNIQUE,
  email       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_id);

-- Resolve UUID interno a partir do JWT Clerk (sub = clerk_id)
CREATE OR REPLACE FUNCTION public.current_app_user_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM users WHERE clerk_id = auth.jwt() ->> 'sub' LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE folders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_folder_id  UUID REFERENCES folders(id) ON DELETE SET NULL,
  name              TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at        TIMESTAMPTZ
);

CREATE INDEX idx_folders_user_parent
  ON folders(user_id, parent_folder_id)
  WHERE deleted_at IS NULL;

CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE documents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id     UUID REFERENCES folders(id) ON DELETE SET NULL,
  title         TEXT NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  content       JSONB NOT NULL DEFAULT '[]'::jsonb,
  content_text  TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE INDEX idx_documents_folder ON documents(folder_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_documents_user ON documents(user_id) WHERE deleted_at IS NULL;

CREATE TRIGGER documents_set_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE study_schedules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  target_date   DATE,
  status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'completed', 'archived')),
  created_by    TEXT NOT NULL DEFAULT 'agent'
                  CHECK (created_by IN ('user', 'agent')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

CREATE TRIGGER study_schedules_set_updated_at
  BEFORE UPDATE ON study_schedules
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE schedule_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id       UUID NOT NULL REFERENCES study_schedules(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  folder_id         UUID REFERENCES folders(id) ON DELETE SET NULL,
  document_id       UUID REFERENCES documents(id) ON DELETE SET NULL,
  scheduled_date    DATE NOT NULL,
  duration_minutes  INTEGER NOT NULL DEFAULT 30,
  topic             TEXT,
  status            TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending', 'done', 'skipped')),
  position          INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_schedule_items_user_date ON schedule_items(user_id, scheduled_date);
CREATE INDEX idx_schedule_items_schedule ON schedule_items(schedule_id, scheduled_date);

CREATE TRIGGER schedule_items_set_updated_at
  BEFORE UPDATE ON schedule_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE forms (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_document_id      UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  schedule_item_id        UUID REFERENCES schedule_items(id) ON DELETE SET NULL,
  title                   TEXT NOT NULL,
  type                    TEXT NOT NULL
                            CHECK (type IN ('flashcard_deck', 'quiz', 'open_form')),
  generation_instruction  TEXT,
  is_stale                BOOLEAN NOT NULL DEFAULT false,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at              TIMESTAMPTZ
);

CREATE INDEX idx_forms_user ON forms(user_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_forms_source_document ON forms(source_document_id) WHERE deleted_at IS NULL;

CREATE TRIGGER forms_set_updated_at
  BEFORE UPDATE ON forms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE form_questions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_id               UUID NOT NULL REFERENCES forms(id) ON DELETE CASCADE,
  type                  TEXT NOT NULL
                          CHECK (type IN ('qa', 'cloze', 'multiple_choice', 'open')),
  prompt                TEXT NOT NULL,
  answer                TEXT NOT NULL,
  choices               JSONB,
  position              INTEGER NOT NULL DEFAULT 0,
  fsrs_state            TEXT NOT NULL DEFAULT 'new'
                          CHECK (fsrs_state IN ('new', 'learning', 'review', 'relearning')),
  fsrs_due              TIMESTAMPTZ NOT NULL DEFAULT now(),
  fsrs_stability        REAL,
  fsrs_difficulty       REAL,
  fsrs_elapsed_days     INTEGER NOT NULL DEFAULT 0,
  fsrs_scheduled_days   INTEGER NOT NULL DEFAULT 0,
  fsrs_reps             INTEGER NOT NULL DEFAULT 0,
  fsrs_lapses           INTEGER NOT NULL DEFAULT 0,
  fsrs_last_review      TIMESTAMPTZ,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at            TIMESTAMPTZ
);

CREATE INDEX idx_form_questions_form ON form_questions(form_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_form_questions_due ON form_questions(fsrs_due) WHERE deleted_at IS NULL;

CREATE TRIGGER form_questions_set_updated_at
  BEFORE UPDATE ON form_questions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE form_reviews (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  form_question_id  UUID NOT NULL REFERENCES form_questions(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating            TEXT NOT NULL CHECK (rating IN ('again', 'hard', 'good', 'easy')),
  state_before      JSONB NOT NULL,
  state_after       JSONB NOT NULL,
  reviewed_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_form_reviews_question
  ON form_reviews(form_question_id, reviewed_at DESC);

-- Imutável: bloqueia UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.forbid_form_reviews_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'form_reviews is append-only';
END;
$$;

CREATE TRIGGER form_reviews_no_update
  BEFORE UPDATE ON form_reviews
  FOR EACH ROW EXECUTE FUNCTION public.forbid_form_reviews_mutation();

CREATE TRIGGER form_reviews_no_delete
  BEFORE DELETE ON form_reviews
  FOR EACH ROW EXECUTE FUNCTION public.forbid_form_reviews_mutation();

CREATE TABLE agent_actions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tool_name   TEXT NOT NULL,
  input       JSONB NOT NULL,
  output      JSONB,
  status      TEXT NOT NULL CHECK (status IN ('success', 'error', 'pending_confirmation')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_agent_actions_user ON agent_actions(user_id, created_at DESC);

CREATE TABLE conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content          TEXT NOT NULL DEFAULT '',
  tool_calls       JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversation_messages_conv
  ON conversation_messages(conversation_id, created_at);

-- Marca formulários como stale quando o documento de origem muda
CREATE OR REPLACE FUNCTION public.mark_forms_stale_on_document_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content
     OR NEW.content_text IS DISTINCT FROM OLD.content_text THEN
    UPDATE forms
    SET is_stale = true, updated_at = now()
    WHERE source_document_id = NEW.id
      AND deleted_at IS NULL
      AND is_stale = false;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER documents_mark_forms_stale
  AFTER UPDATE ON documents
  FOR EACH ROW EXECUTE FUNCTION public.mark_forms_stale_on_document_update();

-- RLS
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedule_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE form_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_select_own ON users
  FOR SELECT USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY users_update_own ON users
  FOR UPDATE USING (clerk_id = auth.jwt() ->> 'sub');

CREATE POLICY folders_all_own ON folders
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY documents_all_own ON documents
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY study_schedules_all_own ON study_schedules
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY schedule_items_all_own ON schedule_items
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY forms_all_own ON forms
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY form_questions_all_own ON form_questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM forms f
      WHERE f.id = form_questions.form_id
        AND f.user_id = public.current_app_user_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM forms f
      WHERE f.id = form_questions.form_id
        AND f.user_id = public.current_app_user_id()
    )
  );

CREATE POLICY form_reviews_select_own ON form_reviews
  FOR SELECT USING (user_id = public.current_app_user_id());

CREATE POLICY form_reviews_insert_own ON form_reviews
  FOR INSERT WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY agent_actions_all_own ON agent_actions
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY conversations_all_own ON conversations
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

CREATE POLICY conversation_messages_all_own ON conversation_messages
  FOR ALL USING (user_id = public.current_app_user_id())
  WITH CHECK (user_id = public.current_app_user_id());

-- Realtime (ignora se já estiver na publication)
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE schedule_items;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE forms;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE form_questions;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

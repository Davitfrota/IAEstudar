-- Fase 2: sessões de prática + form_reviews.session_id

CREATE TABLE IF NOT EXISTS practice_sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  form_id     UUID REFERENCES forms(id) ON DELETE SET NULL,
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_practice_sessions_user
  ON practice_sessions(user_id, started_at DESC);

ALTER TABLE form_reviews
  ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES practice_sessions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_form_reviews_session
  ON form_reviews(session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE practice_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS practice_sessions_all_own ON practice_sessions;
CREATE POLICY practice_sessions_all_own ON practice_sessions
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

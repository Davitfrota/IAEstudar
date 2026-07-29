-- Fase 2b: planos pendentes duráveis (TTL 10min) — fallback sem Redis
CREATE TABLE IF NOT EXISTS pending_agent_plans (
  plan_id     TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload     JSONB NOT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pending_agent_plans_expires
  ON pending_agent_plans(expires_at);

CREATE INDEX IF NOT EXISTS idx_pending_agent_plans_user
  ON pending_agent_plans(user_id);

ALTER TABLE pending_agent_plans ENABLE ROW LEVEL SECURITY;

-- Só service role / backend acessa; sem policies para authenticated
DROP POLICY IF EXISTS pending_agent_plans_deny ON pending_agent_plans;
CREATE POLICY pending_agent_plans_deny ON pending_agent_plans
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

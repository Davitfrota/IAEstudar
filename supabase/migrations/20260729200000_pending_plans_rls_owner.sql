-- Planos pendentes: dono pode CRUD a própria linha (sem service role)
DROP POLICY IF EXISTS pending_agent_plans_deny ON pending_agent_plans;
DROP POLICY IF EXISTS pending_agent_plans_select_own ON pending_agent_plans;
DROP POLICY IF EXISTS pending_agent_plans_insert_own ON pending_agent_plans;
DROP POLICY IF EXISTS pending_agent_plans_update_own ON pending_agent_plans;
DROP POLICY IF EXISTS pending_agent_plans_delete_own ON pending_agent_plans;

CREATE POLICY pending_agent_plans_select_own ON pending_agent_plans
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY pending_agent_plans_insert_own ON pending_agent_plans
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_agent_plans_update_own ON pending_agent_plans
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY pending_agent_plans_delete_own ON pending_agent_plans
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

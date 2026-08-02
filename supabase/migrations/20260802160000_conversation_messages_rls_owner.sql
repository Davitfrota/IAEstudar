-- conversation_messages: exigir ownership da conversa pai.
-- A policy antiga só checava user_id da mensagem, permitindo inserir
-- em conversation_id alheio (envenenamento de histórico do agente
-- quando o backend lê com service role por conversation_id).

DROP POLICY IF EXISTS conversation_messages_all_own ON conversation_messages;

CREATE POLICY conversation_messages_all_own ON conversation_messages
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = public.current_app_user_id()
    )
  )
  WITH CHECK (
    user_id = public.current_app_user_id()
    AND EXISTS (
      SELECT 1 FROM conversations c
      WHERE c.id = conversation_messages.conversation_id
        AND c.user_id = public.current_app_user_id()
    )
  );

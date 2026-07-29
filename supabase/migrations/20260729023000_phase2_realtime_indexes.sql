-- Fase 2: realtime também em pastas/documentos
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE folders;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE documents;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_study_schedules_user
  ON study_schedules(user_id)
  WHERE deleted_at IS NULL;

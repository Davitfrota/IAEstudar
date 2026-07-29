-- Conversas do agente: título + vínculo com cronograma (1 chat ≈ 1 tutor de schedule)
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS schedule_id UUID REFERENCES public.study_schedules(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_conversations_user_updated
  ON public.conversations(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_conversations_schedule
  ON public.conversations(schedule_id)
  WHERE schedule_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'conversations_set_updated_at'
  ) THEN
    CREATE TRIGGER conversations_set_updated_at
      BEFORE UPDATE ON public.conversations
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

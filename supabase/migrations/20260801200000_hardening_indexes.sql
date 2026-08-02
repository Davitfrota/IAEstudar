-- Índices e constraints de robustez (FSRS, agenda, duração)

-- Due queue: filtrar por forms.user_id + due date
CREATE INDEX IF NOT EXISTS idx_form_questions_form_due
  ON public.form_questions (form_id, fsrs_due)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_forms_user_stale
  ON public.forms (user_id, is_stale)
  WHERE deleted_at IS NULL;

-- Evita itens duplicados na mesma posição do cronograma
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_items_schedule_date_pos_uidx'
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_schedule_date_pos_uidx
      UNIQUE (schedule_id, scheduled_date, position);
  END IF;
EXCEPTION
  WHEN unique_violation THEN
    RAISE NOTICE 'schedule_items já tem duplicatas — pulando UNIQUE';
  WHEN duplicate_table THEN
    NULL;
END $$;

-- duration_minutes > 0 quando informado
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'schedule_items_duration_positive'
  ) THEN
    ALTER TABLE public.schedule_items
      ADD CONSTRAINT schedule_items_duration_positive
      CHECK (duration_minutes IS NULL OR duration_minutes > 0);
  END IF;
END $$;

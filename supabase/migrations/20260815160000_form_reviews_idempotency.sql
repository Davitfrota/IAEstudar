-- Idempotência de revisões FSRS (retry de rede não deve avançar o card de novo)
ALTER TABLE form_reviews
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS form_reviews_idempotency_key_uidx
  ON form_reviews (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

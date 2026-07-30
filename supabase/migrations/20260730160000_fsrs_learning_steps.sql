-- Persiste learning_steps do ts-fsrs (obrigatório entre revisões em Learning).
-- Sem esta coluna, Good→Good em card novo mantém o card em learning curto
-- de graduá-lo para review com intervalo de dias.

ALTER TABLE form_questions
  ADD COLUMN IF NOT EXISTS fsrs_learning_steps INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN form_questions.fsrs_learning_steps IS
  'Passo atual na fila de learning/relearning do FSRS (Card.learning_steps)';

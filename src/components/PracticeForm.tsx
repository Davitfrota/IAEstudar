"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import type { FsrsRating } from "@/server/schemas";

export type FormQuestionItem = {
  id: string;
  prompt: string;
  answer: string;
  type: string;
  choices?: unknown;
};

type Props = {
  title?: string;
  formType: "quiz" | "open_form" | string;
  questions: FormQuestionItem[];
  onRate: (questionId: string, rating: FsrsRating) => Promise<void>;
};

type AnswerMap = Record<string, string>;

function normalize(s: string) {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function isMultipleChoice(q: FormQuestionItem) {
  return (
    q.type === "multiple_choice" ||
    (Array.isArray(q.choices) && (q.choices as string[]).length >= 2)
  );
}

function gradeQuestion(q: FormQuestionItem, value: string): boolean {
  if (!value.trim()) return false;
  if (isMultipleChoice(q)) {
    return normalize(value) === normalize(q.answer);
  }
  // discursiva: não auto-avalia como certa; usuário confirma depois
  return false;
}

export function PracticeForm({ title, formType, questions, onRate }: Props) {
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitted, setSubmitted] = useState(false);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const mcqCount = useMemo(
    () => questions.filter((q) => isMultipleChoice(q)).length,
    [questions],
  );

  const score = useMemo(() => {
    if (!submitted) return null;
    let right = 0;
    let graded = 0;
    for (const q of questions) {
      if (!isMultipleChoice(q)) continue;
      graded += 1;
      if (gradeQuestion(q, answers[q.id] ?? "")) right += 1;
    }
    return { right, graded };
  }, [submitted, questions, answers]);

  const setAnswer = (id: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [id]: value }));
  };

  const submit = () => {
    setSubmitted(true);
  };

  const finishWithRatings = async () => {
    setPending(true);
    setErrorMsg(null);
    try {
      for (const q of questions) {
        const value = answers[q.id] ?? "";
        let rating: FsrsRating = "good";
        if (isMultipleChoice(q)) {
          rating = gradeQuestion(q, value) ? "good" : "again";
        } else {
          // discursiva: se escreveu algo → good; vazio → again
          rating = value.trim().length >= 8 ? "good" : "again";
        }
        await onRate(q.id, rating);
      }
      setDone(true);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Falha ao salvar revisão";
      setErrorMsg(message);
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <Card className="bg-mint">
        <CardHeader>
          <CardTitle className="uppercase">Formulário enviado</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {score && score.graded > 0 ? (
            <p>
              Múltipla escolha: <strong>{score.right}</strong> de{" "}
              <strong>{score.graded}</strong> corretas.
            </p>
          ) : null}
          <p className="opacity-80">
            Suas respostas foram registradas na revisão espaçada (FSRS).
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-4">
      <div>
        <p className="font-heading text-sm uppercase opacity-70">
          {formType === "open_form" ? "Formulário aberto" : "Formulário / Quiz"}
        </p>
        <h2 className="font-heading text-2xl uppercase">
          {title ?? "Responda todas as perguntas"}
        </h2>
        <p className="mt-1 text-sm opacity-80">
          {questions.length} perguntas
          {mcqCount > 0 ? ` · ${mcqCount} de marcar` : ""}
          {questions.length - mcqCount > 0
            ? ` · ${questions.length - mcqCount} de escrever`
            : ""}
        </p>
      </div>

      {questions.map((q, index) => {
        const choices = Array.isArray(q.choices)
          ? (q.choices as string[])
          : [];
        const value = answers[q.id] ?? "";
        const showFeedback = submitted;
        const correct = isMultipleChoice(q) && gradeQuestion(q, value);

        return (
          <Card
            key={q.id}
            className={
              showFeedback && isMultipleChoice(q)
                ? correct
                  ? "bg-mint"
                  : "bg-pink"
                : undefined
            }
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-heading normal-case tracking-normal">
                {index + 1}. {q.prompt}
              </CardTitle>
              <p className="text-xs uppercase opacity-60">
                {isMultipleChoice(q) ? "Múltipla escolha" : "Dissertativa"}
              </p>
            </CardHeader>
            <CardContent className="space-y-3">
              {isMultipleChoice(q) ? (
                <div className="space-y-2">
                  {choices.map((c) => {
                    const selected = value === c;
                    return (
                      <label
                        key={c}
                        className={`flex cursor-pointer items-start gap-3 rounded-base border-2 border-border px-3 py-2 text-sm shadow-shadow ${
                          selected ? "bg-main text-main-foreground" : "bg-butter"
                        } ${submitted ? "pointer-events-none opacity-90" : ""}`}
                      >
                        <input
                          type="radio"
                          className="mt-1"
                          name={`q-${q.id}`}
                          value={c}
                          checked={selected}
                          disabled={submitted}
                          onChange={() => setAnswer(q.id, c)}
                        />
                        <span>{c}</span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <textarea
                  className="min-h-24 w-full rounded-base border-2 border-border bg-butter px-3 py-2 text-sm font-base focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-black"
                  placeholder="Escreva sua resposta…"
                  value={value}
                  disabled={submitted}
                  onChange={(e) => setAnswer(q.id, e.target.value)}
                />
              )}

              {showFeedback ? (
                <div className="rounded-base border-2 border-border bg-secondary-background p-3 text-sm">
                  <p className="font-heading text-xs uppercase">
                    {isMultipleChoice(q)
                      ? correct
                        ? "Correto"
                        : "Incorreto"
                      : "Resposta-modelo"}
                  </p>
                  <p className="mt-1">{q.answer}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}

      {!submitted ? (
        <Button
          type="button"
          size="lg"
          className="w-full"
          onClick={submit}
          disabled={questions.some((q) => !(answers[q.id] ?? "").trim())}
        >
          Enviar formulário
        </Button>
      ) : (
        <div className="space-y-2">
          {errorMsg ? (
            <p className="text-center text-sm text-[var(--chart-2)]">
              {errorMsg}
            </p>
          ) : null}
          <Button
            type="button"
            size="lg"
            className="w-full"
            disabled={pending}
            onClick={() => void finishWithRatings()}
          >
            {pending ? "Salvando…" : "Salvar revisão e concluir"}
          </Button>
        </div>
      )}
    </div>
  );
}

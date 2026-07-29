"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type PreviewQuestion = {
  prompt: string;
  answer: string;
  choices?: string[];
};

export type FormEstimate = {
  estimatedCards: number;
  estimatedCredits: number;
  estimatedCostUsd: number;
  model: string;
  note?: string;
};

type Props = {
  questions: PreviewQuestion[];
  estimate?: FormEstimate | null;
  disabled?: boolean;
  onChange: (questions: PreviewQuestion[]) => void;
  onConfirm: () => void;
  onCancel: () => void;
};

export function FormQuestionPreviewEditor({
  questions,
  estimate,
  disabled,
  onChange,
  onConfirm,
  onCancel,
}: Props) {
  const update = (index: number, patch: Partial<PreviewQuestion>) => {
    onChange(
      questions.map((q, i) => (i === index ? { ...q, ...patch } : q)),
    );
  };

  const remove = (index: number) => {
    onChange(questions.filter((_, i) => i !== index));
  };

  return (
    <div className="max-h-[45vh] space-y-3 overflow-y-auto border-t-2 border-border bg-butter/50 px-3 py-3">
      {estimate ? (
        <div className="rounded-base border-2 border-border bg-lavender px-3 py-2 text-sm shadow-shadow">
          <p className="font-heading uppercase">
            ~{estimate.estimatedCards} cards · {estimate.estimatedCredits}{" "}
            créditos · ~US$ {estimate.estimatedCostUsd.toFixed(4)}
          </p>
          <p className="text-xs opacity-80">
            {estimate.model}
            {estimate.note ? ` — ${estimate.note}` : ""}
          </p>
        </div>
      ) : null}

      {questions.map((q, index) => (
        <div
          key={index}
          className="space-y-2 rounded-base border-2 border-border bg-secondary-background p-3"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="font-heading text-xs uppercase">Card {index + 1}</p>
            <Button
              type="button"
              size="sm"
              variant="neutral"
              disabled={disabled || questions.length <= 1}
              onClick={() => remove(index)}
            >
              Remover
            </Button>
          </div>
          <div className="space-y-1">
            <Label htmlFor={`q-prompt-${index}`}>Pergunta</Label>
            <Input
              id={`q-prompt-${index}`}
              value={q.prompt}
              disabled={disabled}
              onChange={(e) => update(index, { prompt: e.target.value })}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor={`q-answer-${index}`}>Resposta</Label>
            <Input
              id={`q-answer-${index}`}
              value={q.answer}
              disabled={disabled}
              onChange={(e) => update(index, { answer: e.target.value })}
            />
          </div>
          {q.choices && q.choices.length > 0 ? (
            <div className="space-y-1">
              <Label htmlFor={`q-choices-${index}`}>
                Alternativas (uma por linha)
              </Label>
              <textarea
                id={`q-choices-${index}`}
                className="min-h-20 w-full rounded-base border-2 border-border bg-butter p-2 text-sm"
                disabled={disabled}
                value={q.choices.join("\n")}
                onChange={(e) =>
                  update(index, {
                    choices: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean),
                  })
                }
              />
            </div>
          ) : null}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <Button type="button" disabled={disabled} onClick={onConfirm}>
          Confirmar {questions.length} card
          {questions.length === 1 ? "" : "s"}
        </Button>
        <Button
          type="button"
          variant="neutral"
          disabled={disabled}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </div>
  );
}

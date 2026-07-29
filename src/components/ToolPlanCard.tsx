"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  FormQuestionPreviewEditor,
  type FormEstimate,
  type PreviewQuestion,
} from "@/components/FormQuestionPreviewEditor";

export type ToolPlanPreview = {
  planId: string;
  summary: string;
  steps: {
    id: string;
    tool: string;
    description: string;
    status: "pending" | "running" | "done" | "error";
  }[];
  estimatedCost?: FormEstimate & { questionCount?: number; note?: string };
  draftQuestions?: PreviewQuestion[];
  status: "awaiting_confirmation" | "executing" | "done" | "error" | "expired";
  expiresAt: number;
};

type Props = {
  plan: ToolPlanPreview;
  disabled?: boolean;
  onConfirm: (draftQuestions?: PreviewQuestion[]) => void;
  onCancel: () => void;
  onRequestEdit: (instruction: string) => void;
};

export function ToolPlanCard({
  plan,
  disabled,
  onConfirm,
  onCancel,
  onRequestEdit,
}: Props) {
  const [questions, setQuestions] = useState<PreviewQuestion[]>(
    plan.draftQuestions ?? [],
  );
  const [editNote, setEditNote] = useState("");

  useEffect(() => {
    setQuestions(plan.draftQuestions ?? []);
  }, [plan.planId, plan.draftQuestions]);

  const canAccept = useMemo(() => {
    if (questions.length === 0) return true;
    return questions.every((q) => q.prompt.trim() && q.answer.trim());
  }, [questions]);

  const remainingMs = Math.max(0, plan.expiresAt - Date.now());
  const remainingMin = Math.ceil(remainingMs / 60000);

  return (
    <div className="mt-3 space-y-3 rounded-base border-2 border-border bg-mint p-3 shadow-shadow">
      <div>
        <p className="font-heading text-sm uppercase">{plan.summary}</p>
        <p className="text-xs opacity-70">
          {plan.status === "awaiting_confirmation"
            ? `Expira em ~${remainingMin} min`
            : plan.status}
        </p>
      </div>

      <ul className="space-y-1 text-sm">
        {plan.steps.map((step) => (
          <li key={step.id} className="flex items-start gap-2">
            <span className="font-heading uppercase">
              {step.status === "done"
                ? "✓"
                : step.status === "running"
                  ? "…"
                  : step.status === "error"
                    ? "!"
                    : "○"}
            </span>
            <span
              className={
                step.status === "done" ? "line-through opacity-70" : undefined
              }
            >
              {step.description}
            </span>
          </li>
        ))}
      </ul>

      {plan.estimatedCost ? (
        <p className="rounded-base border-2 border-border bg-lavender px-2 py-1 text-xs font-heading">
          ~{plan.estimatedCost.questionCount ?? plan.estimatedCost.estimatedCards}{" "}
          cards · {plan.estimatedCost.estimatedCredits} créditos · ~US${" "}
          {Number(plan.estimatedCost.estimatedCostUsd ?? 0).toFixed(4)}
        </p>
      ) : null}

      {questions.length > 0 && plan.status === "awaiting_confirmation" ? (
        <FormQuestionPreviewEditor
          questions={questions}
          estimate={
            plan.estimatedCost
              ? {
                  estimatedCards:
                    plan.estimatedCost.estimatedCards ??
                    plan.estimatedCost.questionCount ??
                    questions.length,
                  estimatedCredits: plan.estimatedCost.estimatedCredits ?? 1,
                  estimatedCostUsd: plan.estimatedCost.estimatedCostUsd ?? 0,
                  model: plan.estimatedCost.model ?? "groq",
                  note: plan.estimatedCost.note,
                }
              : null
          }
          disabled={disabled}
          onChange={setQuestions}
          onConfirm={() => {
            if (canAccept) onConfirm(questions);
          }}
          onCancel={onCancel}
        />
      ) : null}

      {plan.status === "awaiting_confirmation" && questions.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled || !canAccept}
            onClick={() => onConfirm()}
          >
            Confirmar plano
          </Button>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            disabled={disabled}
            onClick={onCancel}
          >
            Cancelar
          </Button>
        </div>
      ) : null}

      {plan.status === "awaiting_confirmation" ? (
        <div className="flex gap-2">
          <input
            className="h-9 flex-1 rounded-base border-2 border-border bg-butter px-2 text-sm"
            placeholder="Ajuste em linguagem natural…"
            value={editNote}
            disabled={disabled}
            onChange={(e) => setEditNote(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && editNote.trim()) {
                onRequestEdit(editNote.trim());
                setEditNote("");
              }
            }}
          />
          <Button
            type="button"
            size="sm"
            variant="lavender"
            disabled={disabled || !editNote.trim()}
            onClick={() => {
              onRequestEdit(editNote.trim());
              setEditNote("");
            }}
          >
            Ajustar
          </Button>
        </div>
      ) : null}

      {plan.status === "expired" ? (
        <p className="text-sm">Plano expirado — peça de novo no chat.</p>
      ) : null}

      {plan.status === "error" ? (
        <p className="text-sm text-black">
          Alguns passos falharam — peça retry só do que faltou.
        </p>
      ) : null}

      <p className="text-[10px] opacity-60">
        Atalhos: Ctrl/Cmd+Enter confirma · Esc cancela
      </p>
    </div>
  );
}

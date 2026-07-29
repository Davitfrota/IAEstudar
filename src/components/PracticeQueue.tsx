"use client";

import { useEffect, useState } from "react";
import type { FsrsRating } from "@/server/schemas";

type FormQuestion = {
  id: string;
  prompt: string;
  answer: string;
  type: string;
  choices?: unknown;
};

type Props = {
  formId: string;
  questions: FormQuestion[];
  onRate: (questionId: string, rating: FsrsRating) => Promise<void>;
};

const ratings: { rating: FsrsRating; label: string; className: string }[] = [
  { rating: "again", label: "Again", className: "bg-[#f3d5d5] text-[var(--danger)]" },
  { rating: "hard", label: "Hard", className: "bg-[#f5e7c4] text-[var(--warn)]" },
  { rating: "good", label: "Good", className: "bg-[var(--accent-soft)] text-[var(--accent)]" },
  { rating: "easy", label: "Easy", className: "bg-[#d8e8f5] text-[#1d4f7a]" },
];

export function PracticeQueue({ questions, onRate }: Props) {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [queue, setQueue] = useState(questions);

  useEffect(() => {
    setQueue(questions);
    setIndex(0);
    setRevealed(false);
  }, [questions]);

  const current = queue[index];

  if (!current) {
    return null;
  }

  const choices = Array.isArray(current.choices)
    ? (current.choices as string[])
    : [];

  const handleRate = async (rating: FsrsRating) => {
    setPending(true);
    try {
      await onRate(current.id, rating);
      const nextQueue = queue.filter((q) => q.id !== current.id);
      setQueue(nextQueue);
      setIndex(0);
      setRevealed(false);
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <p className="text-sm text-[var(--muted)]">
        {queue.length} card{queue.length === 1 ? "" : "s"} due
      </p>
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] p-6 shadow-[var(--shadow)]">
        <p className="font-display text-2xl leading-snug">{current.prompt}</p>
        {revealed ? (
          <div className="mt-6 border-t border-[var(--line)] pt-4">
            <p className="text-sm font-semibold text-[var(--muted)]">Resposta</p>
            <p className="mt-1 text-lg">{current.answer}</p>
            {choices.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--muted)]">
                {choices.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="mt-8 w-full rounded-xl bg-[var(--accent)] px-4 py-4 text-base font-semibold text-white"
          >
            Mostrar resposta
          </button>
        )}
      </div>

      {revealed ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ratings.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={pending}
              onClick={() => handleRate(r.rating)}
              className={`min-h-14 rounded-xl px-3 py-4 text-base font-semibold disabled:opacity-50 ${r.className}`}
            >
              {r.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

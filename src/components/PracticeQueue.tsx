"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

const ratings: { rating: FsrsRating; label: string; shortcut: string; color: string }[] =
  [
    { rating: "again", label: "Again", shortcut: "1", color: "var(--chart-2)" },
    { rating: "hard", label: "Hard", shortcut: "2", color: "var(--chart-3)" },
    { rating: "good", label: "Good", shortcut: "3", color: "var(--chart-4)" },
    { rating: "easy", label: "Easy", shortcut: "4", color: "var(--chart-1)" },
  ];

export function PracticeQueue({ questions, onRate }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [queue, setQueue] = useState(questions);

  useEffect(() => {
    setQueue(questions);
    setRevealed(false);
  }, [questions]);

  const current = queue[0];

  const handleRate = async (rating: FsrsRating) => {
    if (!current || pending || !revealed) return;
    setPending(true);
    try {
      await onRate(current.id, rating);
      setQueue((q) => q.filter((item) => item.id !== current.id));
      setRevealed(false);
    } finally {
      setPending(false);
    }
  };

  useEffect(() => {
    if (!current) return;

    const onKey = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!revealed) setRevealed(true);
        return;
      }
      if (!revealed || pending) return;
      const map: Record<string, FsrsRating> = {
        "1": "again",
        "2": "hard",
        "3": "good",
        "4": "easy",
      };
      const rating = map[e.key];
      if (!rating) return;
      e.preventDefault();
      void (async () => {
        setPending(true);
        try {
          await onRate(current.id, rating);
          setQueue((q) => q.filter((item) => item.id !== current.id));
          setRevealed(false);
        } finally {
          setPending(false);
        }
      })();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [current, revealed, pending, onRate]);

  if (!current) {
    return null;
  }

  const choices = Array.isArray(current.choices)
    ? (current.choices as string[])
    : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <p className="font-heading text-sm uppercase">
        {queue.length} card{queue.length === 1 ? "" : "s"} due
        <span className="ml-2 opacity-60 normal-case">
          Espaço = revelar · 1–4 = rating
        </span>
      </p>
      <Card className="transition-transform duration-200">
        <CardContent className="p-6">
          <p className="font-heading text-2xl leading-snug">{current.prompt}</p>
          {revealed ? (
            <div className="mt-6 border-t-2 border-border pt-4 animate-[fadeUp_200ms_ease-out]">
              <p className="font-heading text-sm uppercase">Resposta</p>
              <p className="mt-1 text-lg">{current.answer}</p>
              {choices.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
                  {choices.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : (
            <Button
              type="button"
              onClick={() => setRevealed(true)}
              className="mt-8 w-full"
              size="lg"
            >
              Mostrar resposta
            </Button>
          )}
        </CardContent>
      </Card>

      {revealed ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {ratings.map((r) => (
            <button
              key={r.rating}
              type="button"
              disabled={pending}
              onClick={() => void handleRate(r.rating)}
              className="min-h-14 rounded-base border-2 border-border px-3 py-4 font-heading text-base uppercase shadow-shadow transition-all hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none disabled:opacity-50"
              style={{ background: r.color }}
            >
              {r.label}
              <span className="mt-1 block text-xs opacity-70">{r.shortcut}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

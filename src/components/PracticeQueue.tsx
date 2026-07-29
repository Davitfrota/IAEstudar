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

type SessionStats = {
  reviewed: number;
  again: number;
  hard: number;
  good: number;
  easy: number;
};

type Props = {
  formId?: string;
  questions: FormQuestion[];
  onRate: (questionId: string, rating: FsrsRating) => Promise<void>;
  sessionStats?: SessionStats;
};

const ratings: {
  rating: FsrsRating;
  label: string;
  shortcut: string;
  color: string;
}[] = [
  { rating: "again", label: "Again", shortcut: "1", color: "var(--chart-2)" },
  { rating: "hard", label: "Hard", shortcut: "2", color: "var(--chart-3)" },
  { rating: "good", label: "Good", shortcut: "3", color: "var(--chart-4)" },
  { rating: "easy", label: "Easy", shortcut: "4", color: "var(--chart-1)" },
];

export function PracticeQueue({ questions, onRate, sessionStats }: Props) {
  const [revealed, setRevealed] = useState(false);
  const [pending, setPending] = useState(false);
  const [queue, setQueue] = useState(questions);
  const [stats, setStats] = useState<SessionStats>(
    sessionStats ?? { reviewed: 0, again: 0, hard: 0, good: 0, easy: 0 },
  );

  useEffect(() => {
    setQueue(questions);
    setRevealed(false);
  }, [questions]);

  const current = queue[0];

  const handleRate = async (rating: FsrsRating) => {
    if (!current || pending || !revealed) return;
    setPending(true);
    setQueue((q) => q.filter((item) => item.id !== current.id));
    setRevealed(false);
    setStats((s) => ({
      ...s,
      reviewed: s.reviewed + 1,
      [rating]: s[rating] + 1,
    }));
    try {
      await onRate(current.id, rating);
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
      if (rating) {
        e.preventDefault();
        void handleRate(rating);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) {
    return (
      <div className="space-y-2 text-center">
        <p className="font-heading text-xl uppercase">Sessão concluída</p>
        <p className="text-sm opacity-80">
          Revisados {stats.reviewed} · again {stats.again} · hard {stats.hard} ·
          good {stats.good} · easy {stats.easy}
        </p>
      </div>
    );
  }

  const choices = Array.isArray(current.choices)
    ? (current.choices as string[])
    : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-heading text-sm uppercase">
          {queue.length} restantes · {stats.reviewed} feitos
        </p>
        <p className="text-xs opacity-60">Espaço = virar · 1–4 = rating</p>
      </div>

      <Card className="transition-transform duration-150">
        <CardContent className="p-6">
          <p className="font-heading text-2xl leading-snug">{current.prompt}</p>
          {revealed ? (
            <div className="mt-6 border-t-2 border-border pt-4 animate-[fadeUp_150ms_ease-out]">
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

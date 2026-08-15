"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { PracticeQueue } from "@/components/PracticeQueue";
import type { FsrsRating } from "@/server/schemas";

type Question = {
  id: string;
  prompt: string;
  answer: string;
  type: string;
  choices?: unknown;
};

export default function PracticePage() {
  const params = useParams<{ formId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/forms/${params.formId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      setQuestions(json.data.questions);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [params.formId]);

  const onRate = async (questionId: string, rating: FsrsRating) => {
    const idempotencyKey = crypto.randomUUID();

    const attempt = async () => {
      const res = await fetch("/api/forms/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          formQuestionId: questionId,
          rating,
          idempotencyKey,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Falha ao registrar");
      return json;
    };

    try {
      await attempt();
    } catch (firstError) {
      // Retry reutiliza a mesma chave; o backend não reaplica FSRS.
      await new Promise((r) => setTimeout(r, 600));
      try {
        await attempt();
      } catch {
        const message =
          firstError instanceof Error ? firstError.message : "Falha ao registrar";
        toast.error(message);
        throw firstError instanceof Error
          ? firstError
          : new Error("Falha ao registrar");
      }
    }
  };

  if (loading) {
    return <div className="h-40 animate-pulse rounded-xl bg-black/5" />;
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        title="Tudo revisado por hoje"
        description="Nenhum card due neste formulário agora."
      />
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="font-display text-3xl">Prática</h1>
      <PracticeQueue
        formId={params.formId}
        questions={questions}
        onRate={onRate}
      />
    </div>
  );
}

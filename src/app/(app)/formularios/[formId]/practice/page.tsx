"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { PracticeForm } from "@/components/PracticeForm";
import { PracticeQueue } from "@/components/PracticeQueue";
import type { FsrsRating } from "@/server/schemas";

type Question = {
  id: string;
  prompt: string;
  answer: string;
  type: string;
  choices?: unknown;
};

type FormMeta = {
  id: string;
  title: string;
  type: "flashcard_deck" | "quiz" | "open_form" | string;
};

export default function PracticePage() {
  const params = useParams<{ formId: string }>();
  const [form, setForm] = useState<FormMeta | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [sessionId, setSessionId] = useState<string | undefined>();
  const [totalDue, setTotalDue] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const [queueRes, formRes] = await Promise.all([
          fetch(`/api/practice/queue?formId=${params.formId}&limit=40`),
          fetch(`/api/forms/${params.formId}`),
        ]);
        const queueJson = await queueRes.json();
        const formJson = await formRes.json();
        if (!queueRes.ok) {
          throw new Error(queueJson.error?.message ?? "Erro na fila");
        }
        if (formRes.ok && formJson.data?.form) {
          setForm(formJson.data.form);
        }
        setQuestions(queueJson.data.questions);
        setSessionId(queueJson.data.sessionId);
        setTotalDue(queueJson.data.totalDue);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [params.formId]);

  const onRate = async (questionId: string, rating: FsrsRating) => {
    const attempt = async () => {
      const res = await fetch("/api/forms/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formQuestionId: questionId, rating, sessionId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Falha ao registrar");
      return json;
    };

    try {
      await attempt();
    } catch {
      await new Promise((r) => setTimeout(r, 600));
      await attempt();
    }
  };

  if (loading) {
    return (
      <div className="h-40 animate-pulse rounded-base border-2 border-border bg-secondary-background shadow-shadow" />
    );
  }

  if (questions.length === 0) {
    return (
      <EmptyState
        title="Tudo revisado por hoje"
        description="Nenhuma questão pendente neste formulário. Volte mais tarde ou peça à Nara novos cards."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/formularios">
              <Button size="sm" variant="neutral">
                Ver formulários
              </Button>
            </Link>
            <Link href="/agente">
              <Button size="sm">Falar com a Nara</Button>
            </Link>
          </div>
        }
      />
    );
  }

  const isFlashcard = (form?.type ?? "flashcard_deck") === "flashcard_deck";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="font-heading text-3xl uppercase">
          {isFlashcard ? "Prática" : "Formulário"}
        </h1>
        <p className="text-sm opacity-80">
          {isFlashcard
            ? `Sessão limitada a ${questions.length} de ${totalDue} due`
            : form?.title ?? `${questions.length} perguntas`}
        </p>
      </div>

      {isFlashcard ? (
        <PracticeQueue
          formId={params.formId}
          questions={questions}
          onRate={onRate}
        />
      ) : (
        <PracticeForm
          title={form?.title}
          formType={form?.type ?? "quiz"}
          questions={questions}
          onRate={onRate}
        />
      )}
    </div>
  );
}

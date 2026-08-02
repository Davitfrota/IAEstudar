"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { NeoBarChart } from "@/components/ui/neo-bar-chart";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

type Form = {
  id: string;
  title: string;
  type: string;
  is_stale: boolean;
  created_at: string;
};

export default function FormulariosPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [dueCount, setDueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/forms");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      setForms(json.data.forms);
      setDueCount(json.data.dueCount);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    } finally {
      setLoading(false);
    }
  }, []);

  const regenerate = async (formId: string) => {
    const confirmed = window.confirm(
      "Regenerar apaga o progresso de repetição espaçada deste formulário. Deseja continuar?",
    );
    if (!confirmed) return;

    setRegenerating(formId);
    try {
      const res = await fetch(`/api/forms/${formId}/regenerate`, {
        method: "POST",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message ?? "Erro");
      toast.success(
        `Regenerado (${json.data.questionsCreated as number} questões)`,
      );
      void load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Falha");
    } finally {
      setRegenerating(null);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    tables: ["forms", "form_questions"],
    onChange: () => {
      void load();
    },
  });

  const chartData = useMemo(() => {
    const counts: Record<string, number> = {
      flashcard_deck: 0,
      quiz: 0,
      open_form: 0,
    };
    for (const form of forms) {
      counts[form.type] = (counts[form.type] ?? 0) + 1;
    }
    return [
      { label: "Flash", value: counts.flashcard_deck },
      { label: "Quiz", value: counts.quiz },
      { label: "Aberto", value: counts.open_form },
    ];
  }, [forms]);

  const firstFormId = forms[0]?.id;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl uppercase">Formulários</h1>
          <p className="font-heading text-sm uppercase text-main">
            {dueCount > 0
              ? `${dueCount} para revisar agora`
              : "Tudo revisado por hoje"}
          </p>
        </div>
        {dueCount > 0 && firstFormId ? (
          <Link href={`/formularios/${firstFormId}/practice`}>
            <Button size="sm">Começar revisão</Button>
          </Link>
        ) : null}
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-base border-2 border-border bg-secondary-background shadow-shadow" />
      ) : forms.length === 0 ? (
        <EmptyState
          title="Nenhum formulário ainda"
          description="Peça à Nara flashcards, quiz ou perguntas abertas a partir dos seus documentos."
          href="/agente"
          actionLabel="Falar com a Nara"
        />
      ) : (
        <>
          <NeoBarChart
            title="Tipos de formulário"
            description="Contagem por type"
            data={chartData}
            color="var(--chart-1)"
          />
          <Card className="overflow-hidden p-0">
            <ul className="divide-y-2 divide-border">
              {forms.map((form) => (
                <li
                  key={form.id}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-butter/60"
                >
                  <div>
                    <p className="font-heading">{form.title}</p>
                    <p className="text-sm opacity-80">
                      {form.type}
                      {form.is_stale ? " · desatualizado" : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {form.is_stale ? (
                      <Button
                        size="sm"
                        variant="neutral"
                        disabled={regenerating === form.id}
                        onClick={() => void regenerate(form.id)}
                      >
                        {regenerating === form.id ? "..." : "Regenerar"}
                      </Button>
                    ) : null}
                    <Link href={`/formularios/${form.id}/practice`}>
                      <Button size="sm">Praticar</Button>
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}
    </div>
  );
}

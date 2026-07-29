"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";

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

  useEffect(() => {
    const load = async () => {
      setLoading(true);
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
    };
    void load();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl">Formulários</h1>
        <p className="text-sm text-[var(--muted)]">
          {dueCount > 0
            ? `${dueCount} cards due agora`
            : "Nenhum card due no momento"}
        </p>
      </div>

      {loading ? (
        <div className="h-32 animate-pulse rounded-xl bg-black/5" />
      ) : forms.length === 0 ? (
        <EmptyState
          title="Nenhum formulário ainda"
          description="Peça ao agente para gerar flashcards, quiz ou perguntas abertas a partir de um documento."
        />
      ) : (
        <ul className="divide-y divide-[var(--line)] rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)]">
          {forms.map((form) => (
            <li
              key={form.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-4"
            >
              <div>
                <p className="font-medium">{form.title}</p>
                <p className="text-sm text-[var(--muted)]">
                  {form.type}
                  {form.is_stale ? " · desatualizado" : ""}
                </p>
              </div>
              <Link
                href={`/formularios/${form.id}/practice`}
                className="rounded-md bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white"
              >
                Praticar
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

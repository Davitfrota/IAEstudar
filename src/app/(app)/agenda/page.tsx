"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import {
  ScheduleCalendar,
  type ScheduleItem,
} from "@/components/ScheduleCalendar";

export default function AgendaPage() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<"week" | "month">("week");

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setView(mq.matches ? "month" : "week");
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/schedules");
        const json = await res.json();
        if (!res.ok) throw new Error(json.error?.message ?? "Erro");
        setItems(json.data.items);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Falha");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl">Agenda</h1>
          <p className="text-sm text-[var(--muted)]">
            Sessões criadas pelo agente e pela API de cronogramas.
          </p>
        </div>
        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            onClick={() => setView("week")}
            className={`rounded-md px-3 py-1.5 text-sm ${view === "week" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`}
          >
            Semana
          </button>
          <button
            type="button"
            onClick={() => setView("month")}
            className={`rounded-md px-3 py-1.5 text-sm ${view === "month" ? "bg-[var(--accent-soft)] text-[var(--accent)]" : "text-[var(--muted)]"}`}
          >
            Lista
          </button>
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-xl bg-black/5" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma sessão ainda"
          description="Peça um cronograma no agente com tópicos e data-alvo."
        />
      ) : (
        <ScheduleCalendar
          items={items}
          view={view}
          onItemClick={(item) =>
            toast.message(item.topic ?? "Sessão", {
              description: `${item.scheduled_date} · ${item.duration_minutes} min`,
            })
          }
        />
      )}
    </div>
  );
}

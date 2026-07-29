"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import {
  ScheduleCalendar,
  type CalendarView,
  type ScheduleItem,
} from "@/components/ScheduleCalendar";
import { Button } from "@/components/ui/button";
import { NeoBarChart } from "@/components/ui/neo-bar-chart";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

export default function AgendaPage() {
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<CalendarView>("month");
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => {
      if (mq.matches && view === "week") setView("month");
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [view]);

  const load = useCallback(async () => {
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
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useRealtimeRefresh({
    tables: ["schedule_items"],
    onChange: () => {
      void load();
    },
  });

  const patchItem = async (
    itemId: string,
    body: { scheduledDate?: string; status?: string },
  ) => {
    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId
          ? {
              ...it,
              scheduled_date: body.scheduledDate ?? it.scheduled_date,
              status: body.status ?? it.status,
            }
          : it,
      ),
    );
    const res = await fetch(`/api/schedule-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast.error("Falha ao atualizar sessão");
      void load();
      return;
    }
    toast.success("Agenda atualizada");
  };

  const chartData = (() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.scheduled_date, (counts.get(item.scheduled_date) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 14)
      .map(([label, value]) => ({
        label: label.slice(5),
        value,
      }));
  })();

  const views: { id: CalendarView; label: string }[] = [
    { id: "week", label: "Semana" },
    { id: "month", label: "Mês" },
    { id: "year", label: "Ano" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl uppercase">Agenda</h1>
          <p className="text-sm opacity-80">
            Arraste sessões entre dias — não altera o FSRS dos cards.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {views.map((v) => (
            <Button
              key={v.id}
              variant={view === v.id ? "default" : "neutral"}
              size="sm"
              className={v.id === "week" ? "hidden md:inline-flex" : undefined}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </Button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="h-48 animate-pulse rounded-base border-2 border-border bg-secondary-background shadow-shadow" />
      ) : items.length === 0 ? (
        <EmptyState
          title="Nenhuma sessão ainda"
          description="Peça um cronograma no agente com tópicos e data-alvo."
        />
      ) : (
        <>
          {chartData.length > 0 && view !== "year" ? (
            <NeoBarChart
              title="Sessões por dia"
              description="Distribuição das schedule_items"
              data={chartData}
              color="var(--chart-4)"
            />
          ) : null}
          <ScheduleCalendar
            items={items}
            view={view}
            cursor={cursor}
            onCursorChange={setCursor}
            onViewChange={setView}
            onItemClick={(item) =>
              toast.message(item.topic ?? "Sessão", {
                description: `${item.scheduled_date} · ${item.duration_minutes} min`,
              })
            }
            onReschedule={(itemId, newDate) =>
              void patchItem(itemId, { scheduledDate: newDate })
            }
            onToggleStatus={(itemId, status) =>
              void patchItem(itemId, { status })
            }
          />
        </>
      )}
    </div>
  );
}

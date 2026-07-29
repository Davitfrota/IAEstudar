"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { EmptyState } from "@/components/EmptyState";
import {
  ScheduleCalendar,
  type ScheduleItem,
} from "@/components/ScheduleCalendar";
import { Button } from "@/components/ui/button";
import { NeoBarChart } from "@/components/ui/neo-bar-chart";
import { useRealtimeRefresh } from "@/hooks/useRealtimeRefresh";

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

  const chartData = (() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      counts.set(item.scheduled_date, (counts.get(item.scheduled_date) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(0, 7)
      .map(([label, value]) => ({
        label: label.slice(5),
        value,
      }));
  })();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-3xl uppercase">Agenda</h1>
          <p className="text-sm opacity-80">
            Atualiza em tempo real quando o agente cria sessões.
          </p>
        </div>
        <div className="hidden gap-2 md:flex">
          <Button
            variant={view === "week" ? "default" : "neutral"}
            size="sm"
            onClick={() => setView("week")}
          >
            Semana
          </Button>
          <Button
            variant={view === "month" ? "default" : "neutral"}
            size="sm"
            onClick={() => setView("month")}
          >
            Lista
          </Button>
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
          {chartData.length > 0 ? (
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
            onItemClick={(item) =>
              toast.message(item.topic ?? "Sessão", {
                description: `${item.scheduled_date} · ${item.duration_minutes} min`,
              })
            }
          />
        </>
      )}
    </div>
  );
}

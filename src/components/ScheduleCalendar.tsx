"use client";

import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export type ScheduleItem = {
  id: string;
  scheduled_date: string;
  duration_minutes: number;
  topic: string | null;
  status: string;
};

type Props = {
  items: ScheduleItem[];
  view: "week" | "month";
  onItemClick: (item: ScheduleItem) => void;
  onReschedule?: (itemId: string, newDate: string) => void;
  onToggleStatus?: (
    itemId: string,
    status: "done" | "skipped" | "pending",
  ) => void;
};

export function ScheduleCalendar({
  items,
  view,
  onItemClick,
  onReschedule,
  onToggleStatus,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const renderItem = (item: ScheduleItem, accent: string) => (
    <div
      key={item.id}
      draggable={Boolean(onReschedule)}
      onDragStart={() => setDraggingId(item.id)}
      onDragEnd={() => setDraggingId(null)}
      className={cn(
        "w-full rounded-base border-2 border-border px-2 py-2 text-left text-sm font-heading shadow-shadow transition-all",
        draggingId === item.id && "opacity-50",
      )}
      style={{ background: accent }}
    >
      <button
        type="button"
        className="w-full text-left"
        onClick={() => onItemClick(item)}
      >
        <span className="block">{item.topic ?? "Sessão"}</span>
        <span className="text-xs font-base opacity-80">
          {item.duration_minutes} min · {item.status}
        </span>
      </button>
      {onToggleStatus ? (
        <div className="mt-2 flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="neutral"
            className="h-7 px-2 text-[10px]"
            onClick={() =>
              onToggleStatus(
                item.id,
                item.status === "done" ? "pending" : "done",
              )
            }
          >
            {item.status === "done" ? "Reabrir" : "Feito"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="neutral"
            className="h-7 px-2 text-[10px]"
            onClick={() => onToggleStatus(item.id, "skipped")}
          >
            Pular
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (view === "week") {
    const start = startOfWeek(new Date(), { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    return (
      <div className="grid gap-3 md:grid-cols-7">
        {days.map((day, i) => {
          const key = format(day, "yyyy-MM-dd");
          const dayItems = items.filter((it) => it.scheduled_date === key);
          const accent = [
            "var(--chart-1)",
            "var(--chart-2)",
            "var(--chart-3)",
            "var(--chart-4)",
            "var(--chart-5)",
          ][i % 5];
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (draggingId && onReschedule) {
                  onReschedule(draggingId, key);
                  setDraggingId(null);
                }
              }}
              className="min-h-36 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
            >
              <p className="font-heading text-xs uppercase tracking-wide">
                {format(day, "EEE d", { locale: ptBR })}
              </p>
              <div className="mt-2 space-y-2">
                {dayItems.map((item) => renderItem(item, accent))}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  const byDate = items.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    acc[item.scheduled_date] ??= [];
    acc[item.scheduled_date].push(item);
    return acc;
  }, {});

  const dates = Object.keys(byDate).sort();

  return (
    <div className="space-y-4">
      {dates.map((date) => (
        <section
          key={date}
          onDragOver={(e) => e.preventDefault()}
          onDrop={() => {
            if (draggingId && onReschedule) {
              onReschedule(draggingId, date);
              setDraggingId(null);
            }
          }}
        >
          <h3 className="mb-2 font-heading text-lg uppercase">
            {format(parseISO(date), "EEEE, d MMM", { locale: ptBR })}
          </h3>
          <div className="space-y-2">
            {byDate[date].map((item) =>
              renderItem(item, "var(--secondary-background)"),
            )}
          </div>
        </section>
      ))}
    </div>
  );
}

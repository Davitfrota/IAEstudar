"use client";

import {
  addDays,
  addMonths,
  addYears,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  startOfYear,
} from "date-fns";
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

export type CalendarView = "week" | "month" | "year";

type Props = {
  items: ScheduleItem[];
  view: CalendarView;
  cursor: Date;
  onCursorChange: (date: Date) => void;
  onViewChange?: (view: CalendarView) => void;
  onItemClick: (item: ScheduleItem) => void;
  onReschedule?: (itemId: string, newDate: string) => void;
  onToggleStatus?: (
    itemId: string,
    status: "done" | "skipped" | "pending",
  ) => void;
};

const accents = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function ScheduleCalendar({
  items,
  view,
  cursor,
  onCursorChange,
  onViewChange,
  onItemClick,
  onReschedule,
  onToggleStatus,
}: Props) {
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const byDate = items.reduce<Record<string, ScheduleItem[]>>((acc, item) => {
    acc[item.scheduled_date] ??= [];
    acc[item.scheduled_date].push(item);
    return acc;
  }, {});

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

  const dropOn = (dateKey: string) => {
    if (draggingId && onReschedule) {
      onReschedule(draggingId, dateKey);
      setDraggingId(null);
    }
  };

  const nav = (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <Button
        type="button"
        size="sm"
        variant="neutral"
        onClick={() => {
          if (view === "week") onCursorChange(addDays(cursor, -7));
          else if (view === "month") onCursorChange(addMonths(cursor, -1));
          else onCursorChange(addYears(cursor, -1));
        }}
      >
        ←
      </Button>
      <p className="font-heading text-sm uppercase">
        {view === "week"
          ? `Semana de ${format(startOfWeek(cursor, { weekStartsOn: 1 }), "d MMM", { locale: ptBR })}`
          : view === "month"
            ? format(cursor, "MMMM yyyy", { locale: ptBR })
            : format(cursor, "yyyy")}
      </p>
      <div className="flex gap-2">
        <Button
          type="button"
          size="sm"
          variant="neutral"
          onClick={() => onCursorChange(new Date())}
        >
          Hoje
        </Button>
        <Button
          type="button"
          size="sm"
          variant="neutral"
          onClick={() => {
            if (view === "week") onCursorChange(addDays(cursor, 7));
            else if (view === "month") onCursorChange(addMonths(cursor, 1));
            else onCursorChange(addYears(cursor, 1));
          }}
        >
          →
        </Button>
      </div>
    </div>
  );

  if (view === "week") {
    const start = startOfWeek(cursor, { weekStartsOn: 1 });
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));

    return (
      <div>
        {nav}
        <div className="grid gap-3 md:grid-cols-7">
          {days.map((day, i) => {
            const key = format(day, "yyyy-MM-dd");
            const dayItems = byDate[key] ?? [];
            return (
              <div
                key={key}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => dropOn(key)}
                className={cn(
                  "min-h-36 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow",
                  isSameDay(day, new Date()) && "bg-mint",
                )}
              >
                <p className="font-heading text-xs uppercase tracking-wide">
                  {format(day, "EEE d", { locale: ptBR })}
                </p>
                <div className="mt-2 space-y-2">
                  {dayItems.map((item) =>
                    renderItem(item, accents[i % accents.length]!),
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  if (view === "year") {
    const yearStart = startOfYear(cursor);
    const months = Array.from({ length: 12 }, (_, i) => addMonths(yearStart, i));

    return (
      <div>
        {nav}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {months.map((monthDate) => {
            const monthStart = startOfMonth(monthDate);
            const monthEnd = endOfMonth(monthDate);
            const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
            const count = days.reduce(
              (n, d) => n + (byDate[format(d, "yyyy-MM-dd")]?.length ?? 0),
              0,
            );
            return (
              <button
                key={format(monthDate, "yyyy-MM")}
                type="button"
                onClick={() => {
                  onCursorChange(monthDate);
                  onViewChange?.("month");
                }}
                className="rounded-base border-2 border-border bg-secondary-background p-4 text-left shadow-shadow transition-all hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none"
              >
                <p className="font-heading text-sm uppercase">
                  {format(monthDate, "MMM", { locale: ptBR })}
                </p>
                <p className="mt-2 text-2xl font-heading">{count}</p>
                <p className="text-xs opacity-70">sessões no mês</p>
                <div className="mt-3 flex flex-wrap gap-1">
                  {days.map((d) => {
                    const key = format(d, "yyyy-MM-dd");
                    const has = (byDate[key]?.length ?? 0) > 0;
                    return (
                      <span
                        key={key}
                        className={cn(
                          "size-1.5 rounded-full",
                          has ? "bg-foreground" : "bg-border/40",
                        )}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  // month grid
  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weekDays = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

  return (
    <div>
      {nav}
      <div className="grid grid-cols-7 gap-2">
        {weekDays.map((d) => (
          <p
            key={d}
            className="text-center font-heading text-[10px] uppercase opacity-60"
          >
            {d}
          </p>
        ))}
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayItems = byDate[key] ?? [];
          const inMonth = isSameMonth(day, cursor);
          return (
            <div
              key={key}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => dropOn(key)}
              className={cn(
                "min-h-24 rounded-base border-2 border-border p-2 shadow-shadow",
                inMonth ? "bg-secondary-background" : "bg-background opacity-50",
                isSameDay(day, new Date()) && "bg-mint",
              )}
            >
              <p className="font-heading text-xs">{format(day, "d")}</p>
              <div className="mt-1 space-y-1">
                {dayItems.slice(0, 3).map((item, i) => (
                  <button
                    key={item.id}
                    type="button"
                    draggable={Boolean(onReschedule)}
                    onDragStart={() => setDraggingId(item.id)}
                    onDragEnd={() => setDraggingId(null)}
                    onClick={() => onItemClick(item)}
                    className="block w-full truncate rounded-base border border-border px-1 py-0.5 text-left text-[10px] font-heading"
                    style={{ background: accents[i % accents.length] }}
                    title={item.topic ?? "Sessão"}
                  >
                    {item.topic ?? "Sessão"}
                  </button>
                ))}
                {dayItems.length > 3 ? (
                  <p className="text-[10px] opacity-60">+{dayItems.length - 3}</p>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

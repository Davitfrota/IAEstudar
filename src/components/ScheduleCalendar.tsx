"use client";

import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { cn } from "@/lib/utils";

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
};

export function ScheduleCalendar({ items, view, onItemClick }: Props) {
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
              className="min-h-36 rounded-base border-2 border-border bg-secondary-background p-3 shadow-shadow"
            >
              <p className="font-heading text-xs uppercase tracking-wide">
                {format(day, "EEE d", { locale: ptBR })}
              </p>
              <div className="mt-2 space-y-2">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item)}
                    className="w-full rounded-base border-2 border-border px-2 py-2 text-left text-sm font-heading transition-all hover:translate-x-boxShadowX hover:translate-y-boxShadowY hover:shadow-none"
                    style={{ background: accent }}
                  >
                    <span className="block">{item.topic ?? "Sessão"}</span>
                    <span className="text-xs font-base opacity-80">
                      {item.duration_minutes} min · {item.status}
                    </span>
                  </button>
                ))}
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
        <section key={date}>
          <h3 className="mb-2 font-heading text-lg uppercase">
            {format(parseISO(date), "EEEE, d MMM", { locale: ptBR })}
          </h3>
          <div className="space-y-2">
            {byDate[date].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item)}
                className={cn(
                  "flex w-full items-center justify-between rounded-base border-2 border-border bg-secondary-background px-4 py-3 text-left shadow-shadow",
                )}
              >
                <span className="font-heading">{item.topic ?? "Sessão"}</span>
                <span className="text-sm">{item.duration_minutes} min</span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

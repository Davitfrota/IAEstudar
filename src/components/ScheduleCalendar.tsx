"use client";

import { format, parseISO, startOfWeek, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";

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
        {days.map((day) => {
          const key = format(day, "yyyy-MM-dd");
          const dayItems = items.filter((i) => i.scheduled_date === key);
          return (
            <div
              key={key}
              className="min-h-36 rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-3"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
                {format(day, "EEE d", { locale: ptBR })}
              </p>
              <div className="mt-2 space-y-2">
                {dayItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onItemClick(item)}
                    className="w-full rounded-md bg-[var(--accent-soft)] px-2 py-2 text-left text-sm text-[var(--accent)]"
                  >
                    <span className="block font-medium">
                      {item.topic ?? "Sessão"}
                    </span>
                    <span className="text-xs opacity-80">
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

  // Mobile / month fallback: lista por dia
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
          <h3 className="mb-2 font-display text-lg">
            {format(parseISO(date), "EEEE, d MMM", { locale: ptBR })}
          </h3>
          <div className="space-y-2">
            {byDate[date].map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onItemClick(item)}
                className="flex w-full items-center justify-between rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] px-4 py-3 text-left"
              >
                <span>{item.topic ?? "Sessão"}</span>
                <span className="text-sm text-[var(--muted)]">
                  {item.duration_minutes} min
                </span>
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

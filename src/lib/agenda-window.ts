import { addDays, formatISO, startOfWeek } from "date-fns";

/** Janela padrão da Agenda: início da semana atual até +1 ano. */
export function defaultAgendaWindow(now: Date = new Date()): {
  from: string;
  to: string;
} {
  const from = startOfWeek(now, { weekStartsOn: 1 });
  const to = addDays(from, 365);
  return {
    from: formatISO(from, { representation: "date" }),
    to: formatISO(to, { representation: "date" }),
  };
}

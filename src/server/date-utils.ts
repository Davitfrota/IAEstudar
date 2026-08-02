import { addDays, differenceInCalendarDays, formatISO, parseISO } from "date-fns";

/** Empurra YYYY-MM-DD para o próximo ano futuro se vier no passado (ex.: LLM usa 2025). */
export function normalizeFutureDate(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate.trim());
  if (!m) return isoDate;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  let target = new Date(year, month - 1, day);

  let guard = 0;
  while (target < today && guard < 30) {
    year += 1;
    target = new Date(year, month - 1, day);
    guard += 1;
  }

  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
}

/** Data civil local (YYYY-MM-DD) — evita drift UTC perto da meia-noite. */
export function localTodayIso(now = new Date()): string {
  return formatISO(now, { representation: "date" });
}

export function localOffsetIso(days: number, now = new Date()): string {
  return formatISO(addDays(now, days), { representation: "date" });
}

/** Cap compartilhado entre expansão do plano e geração de agenda. */
export const MAX_STUDY_PLAN_DAYS = 21;
export const DEFAULT_STUDY_PLAN_DAYS = 14;

export function studyPlanDayCount(opts: {
  targetDate?: string | null;
  now?: Date;
  maxDays?: number;
  defaultSpanDays?: number;
}): number {
  const maxDays = opts.maxDays ?? MAX_STUDY_PLAN_DAYS;
  const defaultSpan = opts.defaultSpanDays ?? DEFAULT_STUDY_PLAN_DAYS - 1;
  const start = parseISO(localTodayIso(opts.now));
  const end = opts.targetDate
    ? parseISO(normalizeFutureDate(opts.targetDate))
    : addDays(start, defaultSpan);
  return Math.min(
    maxDays,
    Math.max(1, differenceInCalendarDays(end, start) + 1),
  );
}

export function studyPlanEndDate(opts: {
  targetDate?: string | null;
  now?: Date;
  maxDays?: number;
  defaultSpanDays?: number;
}): string {
  const days = studyPlanDayCount(opts);
  return formatISO(addDays(parseISO(localTodayIso(opts.now)), days - 1), {
    representation: "date",
  });
}

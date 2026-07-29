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

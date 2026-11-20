/**
 * What you usually spend in a budget for a given month, not an average (one big month drags an
 * average up for a year):
 *
 *  - the typical month: the middle of the last 12 months (months with nothing count as $0);
 *  - unless that same month has run higher in each of the past two years (hockey season,
 *    holidays): then the lower of those two, since it happened every year.
 *
 * Months are numbered year * 12 + month index; `byMonth` holds what was spent in each.
 */
export function usualFor(byMonth: Map<number, number>, target: number, firstMonth: number | null): number {
  if (firstMonth === null) return 0;
  const from = Math.max(firstMonth, target - 12);
  const months: number[] = [];
  for (let k = from; k < target; k += 1) months.push(byMonth.get(k) ?? 0);
  if (!months.length) return 0;
  const sorted = [...months].sort((a, b) => a - b);
  const mid = sorted.length % 2 ? sorted[(sorted.length - 1) / 2] : Math.round((sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const past = [target - 12, target - 24].filter((k) => k >= firstMonth).map((k) => byMonth.get(k) ?? 0);
  const seasonal = past.length === 2 ? Math.min(...past) : 0;
  return Math.max(mid, seasonal);
}

/** The middle value (the typical one), so one big month doesn't move it the way it moves an average. 0 for none. */
export function middleOf(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : Math.round((s[s.length / 2 - 1] + s[s.length / 2]) / 2);
}

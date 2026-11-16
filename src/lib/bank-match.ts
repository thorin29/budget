/**
 * Matches the same transaction arriving twice — once from a CSV file and once
 * from the feed, or from two overlapping files. Banks date the two copies
 * differently (when it happened versus when it posted) and word them
 * differently, so the match is on amount, to the cent, within a few days.
 * Each existing row is used at most once, so two identical coffees in a week
 * stay two coffees.
 */

export interface MatchRow {
  /** YYYY-MM-DD */
  postedOn: string;
  amountCents: number;
  merchant?: string;
}

export const DUPLICATE_WINDOW_DAYS = 3;

const day = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/**
 * For each incoming row, the index of the existing row it duplicates, or -1.
 * Closest date wins; on a tie, the same merchant wins.
 */
export function matchDuplicates(existing: MatchRow[], incoming: MatchRow[], windowDays = DUPLICATE_WINDOW_DAYS): number[] {
  const byAmount = new Map<number, number[]>();
  existing.forEach((row, i) => {
    const list = byAmount.get(row.amountCents) ?? [];
    list.push(i);
    byAmount.set(row.amountCents, list);
  });

  const options: Array<{ inc: number; ex: number; score: number }> = [];
  incoming.forEach((row, inc) => {
    for (const ex of byAmount.get(row.amountCents) ?? []) {
      const gap = Math.abs(day(existing[ex].postedOn) - day(row.postedOn));
      if (gap > windowDays) continue;
      const sameMerchant = row.merchant && existing[ex].merchant && row.merchant === existing[ex].merchant;
      options.push({ inc, ex, score: gap * 2 - (sameMerchant ? 1 : 0) });
    }
  });
  options.sort((a, b) => a.score - b.score || a.inc - b.inc || a.ex - b.ex);

  const result = incoming.map(() => -1);
  const used = new Set<number>();
  for (const { inc, ex } of options) {
    if (result[inc] !== -1 || used.has(ex)) continue;
    result[inc] = ex;
    used.add(ex);
  }
  return result;
}

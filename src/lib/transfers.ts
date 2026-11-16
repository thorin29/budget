/**
 * Finds money moving between the household's own accounts, so it is never
 * counted as spending or income: a card payment out of checking and the same
 * payment arriving on the card, a move to savings and its arrival.
 *
 * A transfer is two transactions in two different accounts, opposite amounts
 * to the cent, posted within a few days of each other. Each transaction pairs
 * at most once, with the closest date winning. Only accounts the person has
 * included (spending or balance-only) take part; a hidden account's side is
 * simply missing, so its transfers stay unpaired.
 *
 * Separately, the cents an institution sends to verify an account link are
 * marked as noise.
 */

export interface TransferCandidate {
  id: string;
  accountId: string;
  /** YYYY-MM-DD */
  postedOn: string;
  /** Cents; negative is money out. */
  amountCents: number;
  description: string;
}

export const TRANSFER_WINDOW_DAYS = 5;

const VERIFICATION = /\b(ACCT ?VERIFY|ACCOUNT VERIFICATION|VERIFICATION|VERIFY|TRIAL DEPOSIT|MICRO ?DEPOSIT)\b/i;

const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

/** Pairs of [money out, money in] ids. */
export function pairTransfers(rows: TransferCandidate[], windowDays = TRANSFER_WINDOW_DAYS): Array<[string, string]> {
  const outs = rows.filter((r) => r.amountCents < 0);
  const ins = new Map<number, TransferCandidate[]>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue;
    const list = ins.get(r.amountCents) ?? [];
    list.push(r);
    ins.set(r.amountCents, list);
  }

  // Closest pairs first, so a near match is never stolen by a far one.
  const options: Array<{ out: TransferCandidate; inn: TransferCandidate; gap: number }> = [];
  for (const out of outs) {
    for (const inn of ins.get(-out.amountCents) ?? []) {
      if (inn.accountId === out.accountId) continue;
      const gap = Math.abs(dayNumber(inn.postedOn) - dayNumber(out.postedOn));
      if (gap <= windowDays) options.push({ out, inn, gap });
    }
  }
  options.sort((a, b) => a.gap - b.gap || a.out.id.localeCompare(b.out.id) || a.inn.id.localeCompare(b.inn.id));

  const used = new Set<string>();
  const pairs: Array<[string, string]> = [];
  for (const { out, inn } of options) {
    if (used.has(out.id) || used.has(inn.id)) continue;
    used.add(out.id);
    used.add(inn.id);
    pairs.push([out.id, inn.id]);
  }
  return pairs;
}

/** Account-link verification deposits and withdrawals: under a dollar, labeled as such. */
export function isVerificationNoise(row: Pick<TransferCandidate, "amountCents" | "description">): boolean {
  return Math.abs(row.amountCents) < 100 && VERIFICATION.test(row.description);
}

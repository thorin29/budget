/**
 * A bill's payment that's in the bank feed but not recorded yet: still pending (a bank holds a
 * transfer or a charge for a day or two before it posts), or posted and waiting for the next match.
 * It's matched by the merchants that paid this bill before and an amount within 10% of the bill or
 * a past payment, dated from a week before the due day to ten days after. Each charge goes to one
 * bill, the closest date first.
 */

export interface PendingBill {
  key: string;
  lineItemId: string;
  /** YYYY-MM-DD */
  dueOn: string;
  budgetedCents: number;
}

export interface FeedCharge {
  id: string;
  merchant: string;
  /** Positive cents. */
  cents: number;
  /** YYYY-MM-DD */
  postedOn: string;
  pending: boolean;
}

export interface PendingCharge {
  txnId: string;
  cents: number;
  postedOn: string;
  pending: boolean;
}

const norm = (m: string) => m.toLowerCase().replace(/\s+/g, " ").trim();
const dayN = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / 86_400_000);

export function matchPendingBills(
  bills: PendingBill[],
  charges: FeedCharge[],
  /** Per bill: the merchants and amounts of its recorded payments. */
  history: Map<string, Array<{ merchant: string; cents: number }>>,
): Map<string, PendingCharge> {
  const options: Array<{ bill: PendingBill; c: FeedCharge; gap: number }> = [];
  for (const bill of bills) {
    const past = history.get(bill.lineItemId) ?? [];
    if (!past.length) continue;
    const merchants = new Set(past.map((p) => norm(p.merchant)));
    const amounts = [bill.budgetedCents, ...past.map((p) => p.cents)].filter((a) => a > 0);
    for (const c of charges) {
      if (!merchants.has(norm(c.merchant))) continue;
      if (!amounts.some((a) => Math.abs(c.cents - a) <= a * 0.1)) continue;
      const gap = dayN(c.postedOn) - dayN(bill.dueOn);
      if (gap < -7 || gap > 10) continue;
      options.push({ bill, c, gap: Math.abs(gap) });
    }
  }
  options.sort((a, b) => a.gap - b.gap || a.c.id.localeCompare(b.c.id));
  const out = new Map<string, PendingCharge>();
  const used = new Set<string>();
  for (const { bill, c } of options) {
    if (out.has(bill.key) || used.has(c.id)) continue;
    used.add(c.id);
    out.set(bill.key, { txnId: c.id, cents: c.cents, postedOn: c.postedOn, pending: c.pending });
  }
  return out;
}

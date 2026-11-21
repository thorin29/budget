/**
 * A charge that looks like a bill payment not matched yet: no category, not linked to a bill, from a
 * merchant that has paid a bill before, for about the same amount (within 10%). A loan payment that
 * is still pending, or a month the bank took $5 less than planned, is the usual case. Such a charge
 * isn't "Needs a category": the bill is still counted as due until the payment is matched, so
 * counting the charge too would count the payment twice.
 */

export interface PastBillPayment {
  merchant: string;
  /** Cents, positive. */
  cents: number;
}

const norm = (merchant: string) => merchant.toLowerCase().replace(/\s+/g, " ").trim();

export function billLookalike(past: PastBillPayment[]): (row: { merchant: string; cents: number; categoryId: string | null; linked: boolean }) => boolean {
  const amounts = new Map<string, number[]>();
  for (const p of past) {
    if (p.cents <= 0) continue;
    const k = norm(p.merchant);
    amounts.set(k, [...(amounts.get(k) ?? []), p.cents]);
  }
  return (row) => {
    if (row.linked || row.categoryId !== null) return false;
    const cents = Math.abs(row.cents);
    return (amounts.get(norm(row.merchant)) ?? []).some((a) => Math.abs(cents - a) <= a * 0.1);
  };
}

import { requireDevice } from "@/server/device-auth";
import { getReview } from "@/server/review";
import { recentAutomation } from "@/server/bills-auto";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/** The Review list: charges that look like bill payments, and what was recorded or moved on its own. */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const [review, auto] = await Promise.all([getReview(), recentAutomation()]);
    return ok({
      looksPaid: review.looksPaid.map((l) => ({
        lineItemId: l.lineItemId,
        year: l.year,
        month: l.month,
        billName: l.billName,
        kind: l.kind,
        budgetedCents: l.budgetedCents,
        txnId: l.txnId,
        amountCents: l.amountCents,
        postedOn: l.postedOn,
        merchant: l.merchant,
        account: l.account,
        reason: l.reason,
      })),
      repeats: review.repeats.length,
      repeatList: review.repeats.map((r) => ({
        key: r.merchantKey,
        merchant: r.merchant,
        typicalCents: r.typicalCents,
        typicalDay: r.typicalDay,
        months: r.months,
        lastOn: r.lastOn,
        account: r.account,
      })),
      recorded: auto.recorded,
      moved: auto.moved,
      count: review.count,
    });
  } catch (error) {
    return fail(error);
  }
}

import { requireDevice } from "@/server/device-auth";
import { cardOverview } from "@/server/card-payments";
import { cardColor, colorStops } from "@/lib/card-colors";
import { fail, ok } from "@/server/http";

export const dynamic = "force-dynamic";

/**
 * Every card that isn't hidden: owed now, the statement picture for cards with
 * their days set, and the color each is drawn in (gradient stops and ink).
 */
export async function GET(request: Request) {
  try {
    await requireDevice(request);
    const o = await cardOverview();
    return ok({
      totalOwedCents: o.totalOwedCents,
      payThisCycleCents: o.payThisCycleCents,
      nextDue: o.nextDue,
      cards: o.rows.map((r) => {
        const color = cardColor(r.color);
        const [from, to] = colorStops(color);
        return {
          id: r.id,
          name: r.name,
          institution: r.institution,
          lastDigits: r.lastDigits,
          color: { id: color.id, from, to, ink: color.ink },
          owedNowCents: r.owedNowCents,
          status: r.status
            ? {
                nextDue: r.status.nextDue,
                dueCents: r.status.dueCents,
                statementCents: r.status.statementCents,
                suggestedCents: r.status.suggestedCents,
                newChargesCents: r.status.newChargesCents,
                plan: r.status.plan,
                paymentsLeft: r.status.paymentsLeft,
                // On a 0% card: each payment needed to clear it by the offer's end.
                monthlyCents: r.status.monthlyCents,
                promoEndsOn: r.status.promoEndsOn,
              }
            : null,
        };
      }),
    });
  } catch (error) {
    return fail(error);
  }
}

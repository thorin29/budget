/**
 * Budget changes: the one list of changes Ledger suggests. Nothing here changes on its own; each
 * waits on the Payments page for Accept or Skip.
 *
 *  - A bill whose payments say its usual amount is off (bill-amounts.ts).
 *  - A budget with no amount set: its usual spending, to set it.
 *  - A budget over its amount three full months running, counted from when its amount was last set
 *    (so a new budget gets three months first). Skip hides it for three months.
 */

import { prisma } from "@/lib/prisma";
import { getMonthPlan } from "./month-plan";
import { amountSuggestions } from "./bill-amounts";
import type { Env } from "./statement-plan";

export type BudgetChange =
  | {
      kind: "bill";
      id: string;
      name: string;
      fromCents: number;
      toCents: number;
      why: string;
      startsFrom: string;
      hasEscrow: boolean;
    }
  | { kind: "unset"; id: string; name: string; toCents: number }
  | {
      kind: "over";
      id: string;
      name: string;
      limitCents: number;
      spentCents: number;
    };

const KEY_SINCE = "budgetAmountsSince";
const monthEnd = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0))
    .toISOString()
    .slice(0, 10);
const prevYm = (ym: string) =>
  new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 2, 1))
    .toISOString()
    .slice(0, 7);

export async function budgetChanges(env?: Env): Promise<BudgetChange[]> {
  const out: BudgetChange[] = [];
  for (const a of await amountSuggestions().catch(() => [])) {
    const s = a.suggestion;
    const why =
      s.kind === "steady"
        ? `${s.count} payments in a row`
        : s.kind === "drift"
          ? "Last 3 bills moved"
          : `Last ${s.count} bills`;
    out.push({
      kind: "bill",
      id: a.lineItemId,
      name: a.name,
      fromCents: a.usualCents,
      toCents: s.cents,
      why,
      startsFrom: a.startsFrom,
      hasEscrow: a.hasEscrow,
    });
  }
  const plan = env?.plan ?? (await getMonthPlan());
  const groups = (await prisma.categoryGroup.findMany({
    select: { id: true, name: true, tier: true, limitCents: true },
  })) as Array<{
    id: string;
    name: string;
    tier: string;
    limitCents: number | null;
  }>;
  for (const g of groups) {
    if (
      (g.tier === "ESSENTIAL" || g.tier === "FLEXIBLE") &&
      g.limitCents === null
    ) {
      const usual = plan.groups.find((x) => x.id === g.id)?.usualCents ?? 0;
      out.push({
        kind: "unset",
        id: g.id,
        name: g.name,
        toCents: Math.ceil(usual / 500) * 500,
      });
    }
  }
  if (env) {
    // When each amount was set: remembered here, and moved on whenever the amount changes.
    const row = (await prisma.setting.findUnique({
      where: { key: KEY_SINCE },
    })) as { value: unknown } | null;
    const since = (
      row?.value && typeof row.value === "object" ? row.value : {}
    ) as Record<string, { cents: number | null; ym: string }>;
    let changed = false;
    for (const g of groups) {
      if (since[g.id]?.cents !== g.limitCents) {
        since[g.id] = { cents: g.limitCents, ym: plan.month };
        changed = true;
      }
    }
    if (changed)
      await prisma.setting.upsert({
        where: { key: KEY_SINCE },
        create: { key: KEY_SINCE, value: since as never },
        update: { value: since as never },
      });
    const snoozed = (await prisma.reviewDismissal.findMany({
      where: {
        kind: "over",
        createdAt: { gte: new Date(Date.now() - 90 * 86_400_000) },
      },
      select: { key: true },
    })) as Array<{ key: string }>;
    const skip = new Set(snoozed.map((d) => d.key));
    // Over three full months running, all after the amount was set.
    const months = [prevYm(plan.month)];
    months.push(prevYm(months[0]), prevYm(prevYm(months[0])));
    const spent = await Promise.all(
      months.map((ym) => env.spending(`${ym}-01`, monthEnd(ym), null)),
    );
    for (const g of groups) {
      if (!g.limitCents || (g.tier !== "ESSENTIAL" && g.tier !== "FLEXIBLE"))
        continue;
      if (
        !(months[2] > (since[g.id]?.ym ?? plan.month)) ||
        skip.has(`${g.id}:${g.limitCents}`)
      )
        continue;
      const each = spent.map((s) => s.byGroup.get(g.id) ?? 0);
      if (each.every((c) => c > g.limitCents!))
        out.push({
          kind: "over",
          id: g.id,
          name: g.name,
          limitCents: g.limitCents,
          spentCents: [...each].sort((a, b) => a - b)[1],
        });
    }
  }
  return out;
}

/** Skip on an over-budget note: hidden for three months (or until the amount changes). */
export async function snoozeOver(
  groupId: string,
  limitCents: number,
): Promise<void> {
  const key = `${groupId}:${limitCents}`;
  await prisma.reviewDismissal.upsert({
    where: { kind_key: { kind: "over", key } },
    create: { kind: "over", key },
    update: { createdAt: new Date() },
  });
}

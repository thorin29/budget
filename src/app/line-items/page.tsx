import { monthSplit } from "@/server/pay-split";
import Link from "next/link";
import { getLineItem, lineItemHistory, listLineItems } from "@/server/line-items";
import { listAccounts } from "@/server/accounts";
import { listCategories } from "@/server/categories";
import { listPaySchedules } from "@/server/pay-schedule";
import { NotFoundError } from "@/server/errors";
import { formatCents, toDecimalString } from "@/lib/money";
import { getSettings } from "@/server/settings";
import { halfFor } from "@/lib/month-model";
import { EmptyState, PageHeading, Pill, buttonClass } from "@/components/ui";
import { LineItemForm, type LineItemDefaults } from "./form";
import { listPayoffs, payoffLine } from "@/server/payoff";
import { prisma } from "@/lib/prisma";
import { displayAccountName } from "@/lib/account-type";
import { createLineItemAction, updateLineItemAction } from "./actions";
import { Drawer } from "./drawer";
import { billAmountHistory } from "@/server/bill-amounts";

export const dynamic = "force-dynamic";

const KIND_LABELS: Record<string, string> = {
  BILL: "Bills",
  SETTLEMENT: "Card payoffs",
  INCOME: "Income",
};

const SCHEDULE_LABELS: Record<string, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  SEMI_ANNUAL: "Twice a year",
  ANNUAL: "Yearly",
  CUSTOM: "Some months",
  ONE_OFF: "One-off",
};

const BLANK: LineItemDefaults = {
  name: "",
  kind: "BILL",
  categoryId: null,
  paidFromId: null,
  chargedToId: null,
  payScheduleId: null,
  plannedAmount: "",
  dueDay: null,
  paidFromSurplus: false,
  autoRecord: true,
  paysCard: "auto",
  paysCardLearned: null,
  payoffMode: "none",
  payoffBalance: "",
  payoffAsOf: "",
  payoffAccountId: null,
  payoffSummary: null,
  paydayNumber: null,
  periodAssignment: "AUTO",
  scheduleKind: "MONTHLY",
  anchorMonth: 1,
  months: [],
  onlyYear: null,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  paymentUrl: "",
  notes: "",
  active: true,
};

async function loadEditing(edit: string | undefined): Promise<LineItemDefaults | null> {
  if (!edit) return null;
  if (edit === "new") return BLANK;
  try {
    const item = await getLineItem(edit);
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      categoryId: item.categoryId,
      paidFromId: item.paidFromId,
      chargedToId: item.chargedToId,
      payScheduleId: item.payScheduleId,
      plannedAmount: toDecimalString(item.plannedAmountCents),
      dueDay: item.dueDay,
      paidFromSurplus: item.paidFromSurplus,
      autoRecord: item.autoRecord,
      paysCard: item.paysCardLocked ? (item.paysCardId ?? "none") : "auto",
      paysCardLearned: !item.paysCardLocked && item.paysCardId ? item.paysCardId : null,
      payoffMode: item.payoffAccountId ? "account" : item.payoffBalanceCents !== null ? "balance" : "none",
      payoffBalance: item.payoffBalanceCents !== null ? toDecimalString(item.payoffBalanceCents) : "",
      payoffAsOf: item.payoffAsOf ?? "",
      payoffAccountId: item.payoffAccountId,
      payoffSummary: null,
      paydayNumber: item.paydayNumber,
      periodAssignment: item.periodAssignment,
      scheduleKind: item.scheduleKind,
      anchorMonth: item.months[0] ?? 1,
      months: item.months,
      onlyYear: item.onlyYear,
      startYear: item.startYear,
      startMonth: item.startMonth,
      endYear: item.endYear,
      endMonth: item.endMonth,
      paymentUrl: item.paymentUrl ?? "",
      notes: item.notes ?? "",
      active: item.active,
    };
  } catch (error) {
    if (error instanceof NotFoundError) return null;
    throw error;
  }
}

export default async function LineItemsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; show?: string; merged?: string }>;
}) {
  const query = await searchParams;
  const showInactive = query.show === "all";

  const [items, accounts, categories, paySchedules, settings, editing, payoffs, loans] = await Promise.all([
    listLineItems({ includeInactive: true }),
    listAccounts({ includeInactive: true }),
    listCategories({ includeInactive: true }),
    listPaySchedules(),
    getSettings(),
    loadEditing(query.edit),
    listPayoffs(),
    prisma.bankAccount.findMany({ where: { hidden: false, type: { in: ["LOAN", "MORTGAGE", "OTHER"] } }, select: { id: true, name: true, nickname: true } }) as Promise<
      Array<{ id: string; name: string; nickname: string | null }>
    >,
  ]);
  const payoffById = new Map(payoffs.map((p) => [p.lineItemId, p]));
  const lineHistory = editing?.id ? await lineItemHistory(editing.id) : null;
  const otherItems = editing?.id ? items.filter((i) => i.id !== editing.id && i.kind === editing.kind).map((i) => ({ id: i.id, name: i.name, active: i.active })) : [];
  const amountHistory = editing?.id ? { id: editing.id, ...(await billAmountHistory(editing.id).catch(() => null)) } : null;

  const accountName = new Map(accounts.map((a) => [a.id, a.name]));
  // Halves follow this month's split, which may come from the pay calendar.
  const now = new Date();
  const { splitDay } = await monthSplit(now.getUTCFullYear(), now.getUTCMonth() + 1, settings);
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));
  const inactiveCount = items.filter((i) => !i.active).length;
  const visible = showInactive ? items : items.filter((i) => i.active);
  const base = showInactive ? "/line-items?show=all" : "/line-items";
  const join = (extra: string) => `${base}${base.includes("?") ? "&" : "?"}${extra}`;

  const groups = (["BILL", "SETTLEMENT", "INCOME"] as const)
    .map((kind) => ({ kind, items: visible.filter((i) => i.kind === kind) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="mx-auto max-w-[1000px]">
      <Link href="/settings" className="mb-2 inline-block text-sm text-muted hover:text-foreground">
        ← Settings
      </Link>
      <PageHeading
        title="Bills & income"
        description="The recurring things that make up a month. The usual amount lives here; a single month that differs is changed on the month view."
        action={
          <div className="flex items-center gap-2">
            {inactiveCount > 0 ? (
              <Link href={showInactive ? "/line-items" : "/line-items?show=all"} className={buttonClass("ghost")}>
                {showInactive ? "Hide inactive" : `Show inactive (${inactiveCount})`}
              </Link>
            ) : null}
            <Link href={join("edit=new")} className={buttonClass("primary")}>
              Add line item
            </Link>
          </div>
        }
      />

      {query.merged ? <p className="mb-3 rounded-xl bg-ok-soft px-4 py-2.5 text-sm text-ok">{query.merged.slice(0, 200)}</p> : null}

      {items.length === 0 ? (
        <EmptyState>
          Nothing added yet. Start with the bills you pay every month — the irregular ones are easier
          once the shape is familiar.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <section key={group.kind} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
              <div className="flex items-baseline justify-between border-b border-line bg-sunken px-5 py-2.5">
                <h2 className="font-sans text-[13px] font-semibold uppercase tracking-wide text-neutral">
                  {KIND_LABELS[group.kind]}
                </h2>
                <p className="tnum text-xs text-muted">
                  {group.items.length} · {formatCents(group.items.filter((i) => i.active).reduce((s, i) => s + i.plannedAmountCents, 0))} usual
                </p>
              </div>
              {group.items.map((item) => {
                const half = halfFor(item.dueDay, item.periodAssignment, splitDay);
                return (
                  <Link
                    key={item.id}
                    href={join(`edit=${item.id}`)}
                    scroll={false}
                    className="flex items-center gap-4 border-b border-line px-5 py-3 transition last:border-b-0 hover:bg-sunken"
                  >
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-semibold ${item.active ? "" : "text-muted line-through"}`}>
                        {item.name}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted">
                        {[
                          item.dueDay ? `Day ${item.dueDay}` : null,
                          item.paidFromId ? accountName.get(item.paidFromId) : null,
                          item.categoryId ? categoryName.get(item.categoryId) : null,
                          payoffById.has(item.id) ? payoffLine(payoffById.get(item.id)!, formatCents) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </p>
                    </div>
                    <span className="hidden gap-1.5 sm:flex">
                      <Pill tone="neutral">{SCHEDULE_LABELS[item.scheduleKind]}</Pill>
                      {item.kind === "INCOME" ? null : item.paidFromSurplus ? (
                        <Pill tone="info">From what&rsquo;s left</Pill>
                      ) : (
                        <Pill tone="neutral">{half === 0 ? "1st half" : "2nd half"}</Pill>
                      )}
                      {item.active ? null : <Pill tone="warn">Inactive</Pill>}
                    </span>
                    <span className="tnum w-24 shrink-0 text-right text-sm font-semibold">
                      {formatCents(item.plannedAmountCents)}
                    </span>
                  </Link>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {editing ? (
        <Drawer closeHref={base} title={editing.id ? editing.name : "New line item"}>
          <LineItemForm
            key={editing.id ?? "new"}
            action={editing.id ? updateLineItemAction : createLineItemAction}
            submitLabel={editing.id ? "Save" : "Add line item"}
            cancelHref={base}
            categories={categories
              .filter((c) => c.active || c.id === editing.categoryId)
              .map((c) => ({ id: c.id, name: c.name }))}
            accounts={accounts
              .filter((a) => a.active || a.id === editing.paidFromId)
              .map((a) => ({ id: a.id, name: a.name }))}
            cards={accounts
              .filter((a) => a.kind === "CREDIT_CARD" && (a.active || a.id === editing.chargedToId))
              .map((a) => ({ id: a.id, name: a.name }))}
            lineHistory={lineHistory}
            otherItems={otherItems}
            amountHistory={amountHistory && "runs" in amountHistory ? (amountHistory as never) : null}
            paySchedules={paySchedules.map((p) => ({ id: p.id, name: p.name }))}
            loans={loans.map((l) => ({ id: l.id, name: l.nickname || displayAccountName(l.name) }))}
            defaults={{
              ...editing,
              payoffSummary: editing.id && payoffById.has(editing.id) ? payoffLine(payoffById.get(editing.id)!, formatCents) : null,
              paysCardLearned: editing.paysCardLearned ? (accounts.find((a) => a.id === editing.paysCardLearned)?.name ?? null) : null,
            }}
          />
        </Drawer>
      ) : null}
    </div>
  );
}

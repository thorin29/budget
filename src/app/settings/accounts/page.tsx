import Link from "next/link";
import { applyTypeGuesses, listBankAccounts, type BankAccountView } from "@/server/bank/accounts";
import { getConnection } from "@/server/bank/sync";
import { listAccounts, ACCOUNT_KINDS } from "@/server/accounts";
import { configuredKey } from "@/lib/secret-box";
import { ACCOUNT_TYPES, GROUPS, SPENDING_TYPES, TYPE_LABELS } from "@/lib/account-type";
import { formatCents } from "@/lib/money";
import { cardColor } from "@/lib/card-colors";
import { Card, EmptyState, Pill, SectionHeading } from "@/components/ui";
import { AccountsForm, AccountRow } from "../../setup/accounts/form";
import { LinkAccountToBank } from "../bank";
import { AccountEditor, RowLink } from "./editor";
import { PlanningExtras } from "../../insights/settings/setup-panel";
import { cushionSetting } from "@/server/envelopes";
import { getMonthPlan } from "@/server/month-plan";

export const dynamic = "force-dynamic";

/**
 * Settings › Accounts: a tile per group with its total, the chosen group's accounts as a list, and
 * the editor beside it, always open on the account clicked (the first one to start). Accounts
 * typed by hand (cash, money the feed doesn't see) are a group of their own.
 */

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));
const KIND_LABELS: Record<string, string> = { BANK: "Bank account", CREDIT_CARD: "Credit card", CASH: "Cash", OTHER: "Other" };
const sum = (rows: BankAccountView[]) => rows.reduce((s, a) => s + (a.balanceCents ?? 0), 0);
const ord = (n: number | null) => (n ? String(n) : "—");
const day = (d: Date) => d.toISOString().slice(5, 10).replace("-", "/");
const BY_HAND = "By hand";

export default async function AccountsSettings({ searchParams }: { searchParams: Promise<{ g?: string; edit?: string }> }) {
  const { g, edit } = await searchParams;
  if (configuredKey()) await applyTypeGuesses();
  const [accounts, connection, ledger, cushion, plan] = await Promise.all([listBankAccounts(), getConnection(), listAccounts({ includeInactive: true }), cushionSetting(), getMonthPlan().catch(() => null)]);
  const debt = { cents: plan?.debt.cents ?? 0, automatic: (plan?.debt.source ?? "auto") !== "set", targetCents: plan?.debt.targetCents ?? null, shortCents: plan?.debt.shortCents ?? 0 };
  const typed = ledger.filter((a) => a.origin !== "bank");

  const live = accounts.filter((a) => !a.hidden);
  const active = live.filter((a) => !a.dormant);
  const tabs = [
    ...GROUPS.map((gr) => ({ key: gr.name, rows: active.filter((a) => gr.types.includes(a.type)), total: true })).filter((x) => x.rows.length),
    { key: "Empty", rows: live.filter((a) => a.dormant), total: false },
    { key: "Hidden", rows: accounts.filter((a) => a.hidden), total: false },
  ].filter((x) => x.rows.length);
  const handTab = g === BY_HAND || (!tabs.length && typed.length > 0);
  const current = handTab ? null : (tabs.find((x) => x.key === g) ?? tabs[0] ?? null);
  const editing = current ? (current.rows.find((a) => a.id === edit) ?? current.rows[0] ?? null) : null;
  const href = (group: string, id?: string) => `/settings/accounts?g=${encodeURIComponent(group)}${id ? `&edit=${id}` : ""}`;

  const bankLedger = ledger.filter((a) => a.kind === "BANK" && a.active);
  const linkOptions = accounts
    .filter((b) => !b.hidden && (b.type === "CHECKING" || b.type === "SAVINGS" || b.type === "CREDIT_CARD"))
    .map((b) => ({ id: b.id, label: b.institution ? `${b.displayName} · ${b.institution}` : b.displayName, type: b.type }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <SectionHeading title="Accounts" />
        <p className="text-xs text-muted">
          {connection ? "Bank feed connected" : "Bank feed not connected"} · {connection?.lastSuccessAt ? `synced ${stamp.format(connection.lastSuccessAt)}` : "no sync yet"} ·{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Bridge Connectivity
          </Link>
        </p>
      </div>

      {!accounts.length && !typed.length ? (
        <EmptyState>
          No accounts yet. Connect your bank feed in{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Bridge Connectivity
          </Link>{" "}
          and they appear here on their own.
        </EmptyState>
      ) : null}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tabs.map((x) => {
          const total = sum(x.rows);
          const on = !handTab && current?.key === x.key;
          return (
            <RowLink key={x.key} href={href(x.key)} className={`rounded-2xl border bg-surface px-4 py-3 shadow-card ${on ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}>
              <span className="block text-xs text-muted">
                {x.key} · {x.rows.length}
              </span>
              <span className={`tnum block text-lg font-bold ${x.total ? (total < 0 ? "text-danger" : "") : "text-muted"}`}>{x.total ? formatCents(total) : x.key === "Hidden" ? "Ignored" : "Folded"}</span>
            </RowLink>
          );
        })}
        <RowLink href={href(BY_HAND)} className={`rounded-2xl border bg-surface px-4 py-3 shadow-card ${handTab ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}>
          <span className="block text-xs text-muted">{BY_HAND}</span>
          <span className="block text-lg font-bold text-muted">{typed.length ? `${typed.length} typed` : "+ Add"}</span>
        </RowLink>
      </div>

      {current && editing ? (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_26rem]">
          <Card className="p-2">
            {/* Settings for the whole group: the cushion kept in checking, the monthly payment on 0% cards. */}
            {current.rows.some((a) => a.type === "CHECKING") ? (
              <div className="mx-1 mb-1 rounded-xl bg-neutral-soft px-3 py-2">
                <PlanningExtras debt={debt} cushionCents={cushion} only="cushion" />
              </div>
            ) : current.rows.some((a) => a.type === "CREDIT_CARD") && current.key !== "Hidden" ? (
              <div className="mx-1 mb-1 rounded-xl bg-neutral-soft px-3 py-2">
                <PlanningExtras debt={debt} cushionCents={cushion} only="debt" />
              </div>
            ) : null}
            <p className="px-3 pb-1 pt-2 text-xs text-muted">
              {current.key === "Empty" ? "No money or activity in 60 days" : current.key === "Hidden" ? "Ignored everywhere" : "Click to edit"}
            </p>
            <ul>
              {current.rows.map((a) => {
                const on = a.id === editing.id;
                const swatch = a.type === "CREDIT_CARD" ? cardColor(a.cardColor).background : null;
                return (
                  <li key={a.id}>
                    <RowLink href={href(current.key, a.id)} className={`grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-4 rounded-xl px-3 py-2.5 text-sm ${on ? "bg-accent-soft shadow-[inset_3px_0_0_var(--color-accent)]" : "hover:bg-neutral-soft"}`}>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span aria-hidden className="h-3.5 w-5 shrink-0 rounded-[3px]" style={swatch ? { background: swatch } : undefined} />
                        <span className="min-w-0">
                          <span className="font-semibold">{a.displayName}</span> {a.isBillsSource ? <Pill tone="info">Bills money</Pill> : null}
                          <span className="block text-xs text-muted">
                            {a.institution ?? "Unknown institution"} · {TYPE_LABELS[a.type]}
                            {a.type === "CREDIT_CARD" ? ` · closes ${ord(a.statementCloseDay)} · due ${ord(a.paymentDueDay)}${a.promoEndsOn ? ` · 0% to ${a.promoEndsOn}` : ""}` : ""}
                          </span>
                        </span>
                      </span>
                      <span className="hidden text-xs text-muted sm:block">{a.latestOn ? `Last activity ${day(a.latestOn)}` : "No activity"}</span>
                      <span className={`tnum text-right font-semibold ${(a.balanceCents ?? 0) < 0 ? "text-danger" : ""}`}>{a.balanceCents === null ? "—" : formatCents(a.balanceCents)}</span>
                    </RowLink>
                  </li>
                );
              })}
            </ul>
          </Card>
          <AccountEditor
            key={editing.id}
            types={TYPE_OPTIONS}
            a={{
              id: editing.id,
              displayName: editing.displayName,
              feedName: editing.name,
              institution: editing.institution,
              nickname: editing.nickname,
              type: editing.type,
              hidden: editing.hidden,
              spending: SPENDING_TYPES.includes(editing.type),
              closeDay: editing.statementCloseDay,
              dueDay: editing.paymentDueDay,
              promoEndsOn: editing.promoEndsOn,
              color: editing.cardColor,
              isBillsSource: editing.isBillsSource,
            }}
          />
        </div>
      ) : null}

      {handTab ? (
        <Card className="space-y-3 p-5">
          
          {typed.length ? (
            <ul className="divide-y divide-line rounded-xl border border-line">
              {typed.map((account) => (
                <li key={account.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
                  <span className="min-w-0">
                    <span className={account.active ? "font-semibold" : "text-muted line-through"}>{account.name}</span>
                    <span className="ml-2 text-xs text-muted">
                      {KIND_LABELS[account.kind]}
                      {account.active ? "" : " · inactive"}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-start gap-2">
                    {account.kind === "BANK" || account.kind === "CREDIT_CARD" ? (
                      <LinkAccountToBank
                        accountId={account.id}
                        current={account.bankAccountId ?? ""}
                        options={linkOptions.filter((o) => (account.kind === "CREDIT_CARD" ? o.type === "CREDIT_CARD" : o.type !== "CREDIT_CARD"))}
                      />
                    ) : null}
                    <AccountRow account={account} kindLabel={KIND_LABELS[account.kind]} settledByName={null} removeOnly />
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          <details open={!typed.length}>
            <summary className="cursor-pointer text-sm font-semibold text-accent-text">+ Add an account</summary>
            <div className="mt-2">
              <AccountsForm kinds={ACCOUNT_KINDS.map((k) => ({ value: k, label: KIND_LABELS[k] }))} bankAccounts={bankLedger.map((a) => ({ id: a.id, name: a.name }))} />
            </div>
          </details>
        </Card>
      ) : null}
    </div>
  );
}

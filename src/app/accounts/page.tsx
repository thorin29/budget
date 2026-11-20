import Link from "next/link";
import { applyTypeGuesses, listBankAccounts, type BankAccountView } from "@/server/bank/accounts";
import { getConnection } from "@/server/bank/sync";
import { configuredKey } from "@/lib/secret-box";
import { ACCOUNT_TYPES, GROUPS, SPENDING_TYPES, TYPE_LABELS, displayAccountName } from "@/lib/account-type";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, PageHeading, Pill } from "@/components/ui";
import { AccountTypeSelect, CardTerms, HideAccount } from "../settings/bank";

export const dynamic = "force-dynamic";

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));

const money = (cents: number) => formatCents(cents);
const sum = (rows: BankAccountView[]) => rows.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

/**
 * Accounts on one screen: a tile per group with its total (plus empty and hidden ones), the chosen
 * group's accounts as one table, and the account being edited in a panel beside it (name, type,
 * card terms, hide). The group and the account being edited live in the address.
 */

const day = (d: Date) => d.toISOString().slice(5, 10).replace("-", "/");
const ord = (n: number | null) => (n ? String(n) : "—");

function Editor({ a, back }: { a: BankAccountView; back: string }) {
  return (
    <Card className="space-y-4 self-start p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-bold">{a.displayName}</h2>
          <p className="text-xs text-muted">
            {a.institution ?? "Unknown institution"} · {SPENDING_TYPES.includes(a.type) ? "counts as spending" : "net worth only"}
            {a.isBillsSource ? " · keeps the bills balance" : ""}
          </p>
        </div>
        <Link href={back} aria-label="Close" className="text-muted hover:text-foreground">
          ✕
        </Link>
      </div>
      <div>
        <p className="mb-1 text-xs text-muted">Type</p>
        <AccountTypeSelect id={a.id} type={a.type} options={TYPE_OPTIONS} />
      </div>
      {a.type === "CREDIT_CARD" && !a.hidden ? (
        <div>
          <p className="mb-1 text-xs text-muted">Card details</p>
          <CardTerms id={a.id} closeDay={a.statementCloseDay} dueDay={a.paymentDueDay} promoEndsOn={a.promoEndsOn} color={a.cardColor} nickname={a.nickname} feedName={displayAccountName(a.name)} />
        </div>
      ) : null}
      <div className="border-t border-line pt-3">
        <HideAccount id={a.id} hidden={a.hidden} />
        <p className="mt-1 text-xs text-muted">A hidden account is ignored everywhere: not spending, not net worth, no transfer matching.</p>
      </div>
    </Card>
  );
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ g?: string; edit?: string }> }) {
  const { g, edit } = await searchParams;
  if (configuredKey()) await applyTypeGuesses();
  const [accounts, connection] = await Promise.all([listBankAccounts(), getConnection()]);

  if (!accounts.length) {
    return (
      <div>
        <PageHeading title="Accounts" />
        <EmptyState>
          No accounts yet. Connect your bank feed in{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Settings → Bank sync
          </Link>{" "}
          and they appear here on their own.
        </EmptyState>
      </div>
    );
  }

  const live = accounts.filter((a) => !a.hidden);
  const active = live.filter((a) => !a.dormant);
  const tabs = [
    ...GROUPS.map((gr) => ({ key: gr.name, rows: active.filter((a) => gr.types.includes(a.type)), total: true })).filter((x) => x.rows.length),
    { key: "Empty", rows: live.filter((a) => a.dormant), total: false },
    { key: "Hidden", rows: accounts.filter((a) => a.hidden), total: false },
  ].filter((x) => x.rows.length);
  const current = tabs.find((x) => x.key === g) ?? tabs[0];
  const editing = edit ? accounts.find((a) => a.id === edit) ?? null : null;
  const href = (group: string, id?: string) => `/accounts?g=${encodeURIComponent(group)}${id ? `&edit=${id}` : ""}`;
  const isCards = current.rows.some((a) => a.type === "CREDIT_CARD");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-heading text-[28px] font-bold tracking-tight">Accounts</h1>
        <p className="text-sm text-muted">
          {connection ? "Bank feed connected" : "Bank feed not connected"} · {connection?.lastSuccessAt ? `synced ${stamp.format(connection.lastSuccessAt)}` : "no sync yet"} · {active.length} in use ·{" "}
          <Link href="/settings/bank" className="font-semibold text-accent-text hover:underline">
            Bank sync settings
          </Link>
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {tabs.map((x) => {
          const total = sum(x.rows);
          return (
            <Link
              key={x.key}
              href={href(x.key)}
              className={`rounded-2xl border bg-surface px-4 py-3 shadow-card ${x.key === current.key ? "border-accent ring-1 ring-accent" : "border-line hover:border-line-strong"}`}
            >
              <span className="block text-xs text-muted">
                {x.key} · {x.rows.length}
              </span>
              <span className={`tnum block text-lg font-bold ${x.total ? (total < 0 ? "text-danger" : "") : "text-muted"}`}>{x.total ? money(total) : x.key === "Hidden" ? "Ignored" : "Folded"}</span>
            </Link>
          );
        })}
      </div>

      <div className={`grid grid-cols-1 items-start gap-4 ${editing ? "xl:grid-cols-[minmax(0,1fr)_24rem]" : ""}`}>
        <Card className="p-0">
          <div className="flex items-baseline justify-between px-4 pb-1 pt-4">
            <h2 className="text-base font-bold">{current.key}</h2>
            <span className="text-xs text-muted">
              {current.key === "Empty" ? "No money and no activity in 60 days; they come back on their own." : current.key === "Hidden" ? "Ignored everywhere." : "Click a row to edit"}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <tbody className="divide-y divide-line">
                {current.rows.map((a) => (
                  <tr key={a.id} className={editing?.id === a.id ? "bg-accent-soft/40" : "hover:bg-neutral-soft"}>
                    <td className="px-4 py-2.5">
                      <Link href={href(current.key, a.id)} className="block">
                        <span className="font-semibold">{a.displayName}</span> {a.isBillsSource ? <Pill tone="info">Bills balance</Pill> : null}
                        <span className="block text-xs text-muted">{a.institution ?? "Unknown institution"}</span>
                      </Link>
                    </td>
                    <td className="text-xs text-muted">{TYPE_LABELS[a.type]}</td>
                    <td className={`tnum pr-6 text-right font-semibold ${(a.balanceCents ?? 0) < 0 ? "text-danger" : ""}`}>{a.balanceCents === null ? "—" : money(a.balanceCents)}</td>
                    {isCards ? (
                      <td className="text-xs text-muted">{a.type === "CREDIT_CARD" ? `Closes ${ord(a.statementCloseDay)} · due ${ord(a.paymentDueDay)}${a.promoEndsOn ? ` · 0% to ${a.promoEndsOn}` : ""}` : ""}</td>
                    ) : null}
                    <td className="text-xs text-muted">{a.latestOn ? `Last activity ${day(a.latestOn)}` : "No activity"}</td>
                    <td className="pr-4 text-right">
                      <Link href={href(current.key, a.id)} className="text-xs font-semibold text-accent-text hover:underline">
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        {editing ? <Editor a={editing} back={href(current.key)} /> : null}
      </div>
    </div>
  );
}

import Link from "next/link";
import { applyTypeGuesses, listBankAccounts, type BankAccountView } from "@/server/bank/accounts";
import { getConnection } from "@/server/bank/sync";
import { configuredKey } from "@/lib/secret-box";
import { ACCOUNT_TYPES, GROUPS, SPENDING_TYPES, TYPE_LABELS } from "@/lib/account-type";
import { formatCents } from "@/lib/money";
import { Card, EmptyState, PageHeading, Pill, buttonClass } from "@/components/ui";
import { AccountTypeSelect, CardTerms, HideAccount } from "../settings/bank";

export const dynamic = "force-dynamic";

const stamp = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const TYPE_OPTIONS = ACCOUNT_TYPES.map((t) => ({ value: t, label: TYPE_LABELS[t] }));

const money = (cents: number) => formatCents(cents);
const sum = (rows: BankAccountView[]) => rows.reduce((s, a) => s + (a.balanceCents ?? 0), 0);

function Row({ a }: { a: BankAccountView }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{a.displayName}</span>
          {a.isBillsSource ? <Pill tone="info">Bills balance</Pill> : null}
        </span>
        <span className="block text-xs text-muted">
          {a.institution ?? "Unknown institution"} · {SPENDING_TYPES.includes(a.type) ? "spending" : "net worth only"}
          {a.latestOn ? ` · last activity ${a.latestOn.toISOString().slice(5, 10).replace("-", "/")}` : ""}
        </span>
      </span>
      <span className="flex flex-wrap items-center gap-3">
        <span className="tnum font-semibold">{a.balanceCents === null ? "—" : money(a.balanceCents)}</span>
        <AccountTypeSelect id={a.id} type={a.type} options={TYPE_OPTIONS} />
        <HideAccount id={a.id} hidden={a.hidden} />
      </span>
      {a.type === "CREDIT_CARD" && !a.hidden ? (
        <span className="basis-full">
          <CardTerms id={a.id} closeDay={a.statementCloseDay} dueDay={a.paymentDueDay} promoEndsOn={a.promoEndsOn} color={a.cardColor} />
        </span>
      ) : null}
    </li>
  );
}

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { show } = await searchParams;
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
  const dormant = live.filter((a) => a.dormant);
  const hidden = accounts.filter((a) => a.hidden);
  const owned = sum(live.filter((a) => (a.balanceCents ?? 0) > 0));
  const owed = sum(live.filter((a) => (a.balanceCents ?? 0) < 0));

  return (
    <div className="space-y-6">
      <PageHeading
        title="Accounts"
        description="Everything your bank feed sends, sorted by type on its own. Fix a wrong type, or hide an account that isn't yours."
        action={
          <Link href="/transactions" className={buttonClass("quiet")}>
            Transactions
          </Link>
        }
      />

      <div className="flex flex-wrap gap-4">
        <section className="flex min-w-[260px] flex-[2] flex-col gap-1 rounded-[20px] bg-hero p-6 text-hero-text">
          <span className="text-sm font-semibold text-hero-muted">Net worth</span>
          <span className="tnum font-heading text-4xl font-bold tracking-tight">{money(owned + owed)}</span>
          <span className="text-sm text-hero-muted">
            Own {money(owned)} · owe {money(-owed)}
          </span>
        </section>
        <Card className="flex min-w-[240px] flex-1 flex-col gap-1 p-5">
          <span className="text-sm font-bold">{connection ? "Bank feed connected" : "Bank feed not connected"}</span>
          <span className="text-sm text-muted">
            {connection?.lastSuccessAt ? `Synced ${stamp.format(connection.lastSuccessAt)}` : "No sync yet"} · {active.length} in use
          </span>
          <span className="text-xs text-muted">Read-only. Names and descriptions are stored encrypted.</span>
          <Link href="/settings/bank" className="mt-1 text-sm font-semibold text-accent-text hover:underline">
            Bank sync settings
          </Link>
        </Card>
      </div>

      {GROUPS.map((group) => {
        const rows = active.filter((a) => group.types.includes(a.type));
        if (!rows.length) return null;
        return (
          <Card key={group.name} className="p-0">
            <div className="flex items-baseline justify-between px-4 pb-1 pt-4">
              <h2 className="text-xs font-bold uppercase tracking-wide text-muted">{group.name}</h2>
              <span className="tnum text-sm font-bold">{money(sum(rows))}</span>
            </div>
            <ul className="divide-y divide-line">{rows.map((a) => <Row key={a.id} a={a} />)}</ul>
          </Card>
        );
      })}

      {dormant.length ? (
        <Card className="p-0">
          <Link
            href={show === "empty" ? "/accounts" : "/accounts?show=empty"}
            className="flex items-center justify-between px-4 py-3 text-sm font-semibold text-muted hover:text-foreground"
          >
            {show === "empty" ? "Fold empty accounts away" : `${dormant.length} empty accounts folded away`}
            <span aria-hidden="true">{show === "empty" ? "▴" : "▾"}</span>
          </Link>
          {show === "empty" ? (
            <>
              <p className="px-4 pb-2 text-xs text-muted">No money in them and no activity in 60 days. They come back on their own if that changes.</p>
              <ul className="divide-y divide-line border-t border-line">{dormant.map((a) => <Row key={a.id} a={a} />)}</ul>
            </>
          ) : null}
        </Card>
      ) : null}

      {hidden.length ? (
        <Card className="p-0">
          <div className="px-4 pb-1 pt-4">
            <h2 className="text-xs font-bold uppercase tracking-wide text-muted">Hidden</h2>
            <p className="text-xs text-muted">Ignored everywhere: not spending, not net worth, no transfer matching.</p>
          </div>
          <ul className="divide-y divide-line">{hidden.map((a) => <Row key={a.id} a={a} />)}</ul>
        </Card>
      ) : null}
    </div>
  );
}

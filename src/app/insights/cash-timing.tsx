/**
 * Cash timing: checking day by day through the rest of this month and next,
 * whether it covers every bill and full card payment on its due date, and
 * what each paycheck has to pay.
 */

import Link from "next/link";
import type { CashTimingView } from "@/server/cash-timing";
import type { CashStep } from "@/lib/cash-timing";
import { Card } from "@/components/ui";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;
const exact = (cents: number) => `${cents < 0 ? "−" : ""}$${(Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const at = (iso: string) => Date.parse(`${iso}T00:00:00Z`);

/** The balance as steps: flat between events, a drop or jump on each one's date. */
function BalanceChart({ cash }: { cash: CashTimingView }) {
  const W = 640, H = 170, L = 8, R = 8, T = 14, B = 26;
  const t0 = at(cash.today), t1 = at(cash.until);
  const values = [cash.startCents, ...cash.steps.map((s) => s.balanceCents)];
  const hi = Math.max(0, ...values), lo = Math.min(0, ...values);
  const span = Math.max(1, hi - lo);
  const x = (iso: string) => L + ((at(iso) - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (c: number) => T + ((hi - c) / span) * (H - T - B);
  let d = `M${x(cash.today)} ${y(cash.startCents)}`;
  let last = cash.startCents;
  for (const s of cash.steps) {
    d += `H${x(s.date)}V${y(s.balanceCents)}`;
    last = s.balanceCents;
  }
  d += `H${x(cash.until)}`;
  const area = `${d}V${y(0)}H${x(cash.today)}Z`;
  const months: string[] = [];
  for (let m = new Date(at(cash.today)); m.getTime() <= t1; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
    const first = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
    if (first.getTime() <= t1) months.push(first.toISOString().slice(0, 10));
  }
  void last;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 w-full" role="img" aria-label={`Checking from ${day(cash.today)} to ${day(cash.until)}; lowest ${money(cash.lowCents)} on ${day(cash.lowOn)}`}>
      <line x1={L} x2={W - R} y1={y(0)} y2={y(0)} stroke="var(--border-strong)" strokeDasharray="4 4" />
      {months.map((mm) => (
        <g key={mm}>
          <line x1={x(mm)} x2={x(mm)} y1={T} y2={H - B} stroke="var(--border)" />
          <text x={x(mm) + 4} y={H - 8} fontSize="11" className="fill-muted">
            {new Date(`${mm}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", timeZone: "UTC" })} 1
          </text>
        </g>
      ))}
      <path d={area} fill="var(--accent)" fillOpacity="0.1" />
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" />
      {cash.lowCents < 0 ? <path d={d} fill="none" stroke="var(--chart-negative)" strokeWidth="2" clipPath="url(#below)" /> : null}
      <defs>
        <clipPath id="below">
          <rect x={0} y={y(0)} width={W} height={H} />
        </clipPath>
      </defs>
      <circle cx={x(cash.lowOn)} cy={y(cash.lowCents)} r="4" fill={cash.lowCents < 0 ? "var(--chart-negative)" : "var(--accent)"} />
      <text x={Math.min(W - 120, x(cash.lowOn) + 6)} y={Math.min(H - B - 4, y(cash.lowCents) + 14)} fontSize="11" className="fill-foreground">
        lowest {money(cash.lowCents)}
      </text>
      <text x={L} y={H - 8} fontSize="11" className="fill-muted">
        Today
      </text>
    </svg>
  );
}

function Item({ s }: { s: CashStep }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-xs">
      <span className="min-w-0 flex-1 truncate">
        <span className="tnum text-muted">{day(s.date)}</span> {s.label}
        {s.kind === "card" ? <span className="text-muted"> · card, in full{s.estimate ? " (so far)" : ""}</span> : null}
        {s.kind === "debt" ? <span className="text-muted"> · 0% payment</span> : null}
        {s.overdue ? <span className="ml-1 rounded-full bg-danger-soft px-1.5 py-0.5 text-[10px] font-bold text-danger">Overdue</span> : null}
      </span>
      <span className="flex shrink-0 gap-3">
        <span className="tnum">{exact(-s.cents)}</span>
        <span className={`tnum hidden w-20 text-right sm:inline ${s.balanceCents < 0 ? "font-semibold text-danger" : "text-muted"}`}>{money(s.balanceCents)}</span>
      </span>
    </li>
  );
}

export function CashTimingCard({ cash }: { cash: CashTimingView }) {
  if (cash.missing) {
    return (
      <Card>
        <h2 className="text-base font-bold">Will checking cover it?</h2>
        <p className="mt-1 text-sm text-muted">
          This needs checking&rsquo;s balance. Choose the bills account in{" "}
          <Link href="/settings/planning" className="font-semibold text-accent-text hover:underline">
            Settings
          </Link>{" "}
          and link it to the bank.
        </p>
      </Card>
    );
  }
  const short = cash.shortOn !== null;
  const shortStep = short ? cash.steps.find((s) => s.date === cash.shortOn && s.balanceCents < 0) : null;
  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Will checking cover it?</h2>
        <span className="text-xs text-muted">
          Checking {money(cash.startCents)} now{cash.balanceAsOf ? `, as of ${day(cash.balanceAsOf.slice(0, 10))}` : ""} · through {day(cash.until)}
        </span>
      </div>
      <p className={`mt-2 rounded-xl px-3.5 py-2.5 text-sm ${short ? "bg-danger-soft text-danger" : "bg-ok-soft text-ok"}`}>
        {short
          ? `Checking would run short on ${day(cash.shortOn!)}${shortStep ? `, when ${shortStep.label} takes ${money(-shortStep.cents)}` : ""}. It gets as low as ${money(cash.lowCents)} on ${day(cash.lowOn)}. Move money in or pay something later before then.`
          : `Checking covers every bill and full card payment through ${day(cash.until)}. The lowest it gets is ${money(cash.lowCents)}, on ${day(cash.lowOn)}.`}
      </p>
      <BalanceChart cash={cash} />
      <div className="mt-3 grid min-w-0 gap-3 lg:grid-cols-2">
        {cash.spans.map((sp, i) => (
          <div key={sp.from} className="min-w-0 rounded-xl border border-line p-3">
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-semibold">
                {i === 0 && sp.payCents === 0 ? `Now until ${day(sp.to)}` : `${day(sp.from)} paycheck`}
              </span>
              <span className="tnum text-xs text-muted">
                {sp.payCents ? `${money(sp.payCents)} in · ` : ""}
                {money(sp.outCents)} out
              </span>
            </div>
            {sp.items.length ? (
              <ul className="mt-1 divide-y divide-line">
                {sp.items.map((s, k) => (
                  <Item key={`${s.date}:${s.label}:${k}`} s={s} />
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted">Nothing due.</p>
            )}
            <p className={`mt-1 flex justify-between border-t border-line pt-1 text-xs font-semibold ${sp.endCents < 0 ? "text-danger" : ""}`}>
              <span>{cash.spans[i + 1] ? `In checking before the ${day(cash.spans[i + 1].from)} paycheck` : `In checking on ${day(sp.to)}`}</span>
              <span className="tnum">{money(sp.endCents)}</span>
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted">
        Cards are paid in full on their due dates: this statement&rsquo;s balance, then what&rsquo;s been charged since as the next one
        (it&rsquo;ll grow as you spend). Bills charged to a card are inside the card&rsquo;s payment.
        {cash.cardsWithoutDays > 0 ? ` ${cash.cardsWithoutDays} card${cash.cardsWithoutDays === 1 ? " has" : "s have"} no statement and due days set, so ${cash.cardsWithoutDays === 1 ? "its payment isn't" : "their payments aren't"} here: set them on Accounts.` : ""}
      </p>
    </Card>
  );
}

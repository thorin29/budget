"use client";

/**
 * Cards, two ways:
 *
 *  - CardDeck: a wallet-style stack for the top of the month. The summary card
 *    sits in front and the rest fan out to the side, each in the color the
 *    person picked. Tap, swipe or press ← → and the front card slides out and
 *    tucks in at the back.
 *  - CardTable: every card side by side, for the bottom of the month.
 *
 * Each face leads with what to pay this cycle, then the running tally: the
 * whole balance, the part on the current statement, and what has built up
 * since it closed (headed for the next one).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { cardColor, faceName } from "@/lib/card-colors";

export interface DeckCard {
  id: string;
  name: string;
  institution: string | null;
  lastDigits: string | null;
  color: string | null;
  owedNowCents: number;
  status: {
    nextDue: string;
    dueCents: number;
    statementCents: number;
    suggestedCents: number;
    newChargesCents: number;
    plan: "statement" | "payoff" | "paid";
    paymentsLeft: number | null;
    promoEndsOn: string | null;
  } | null;
}

export interface DeckSummary {
  totalOwedCents: number;
  payThisCycleCents: number;
  nextDue: string | null;
}

/** The card's name without the trailing account digits, which the face shows on their own. */
// Feeds often repeat the digits ("Card - 1234 (1234)").
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const money = (cents: number) => formatCents(cents);
const whole = (cents: number) => formatCents(Math.round(cents / 100) * 100).replace(/\.00$/, "");

/** Balance = on the statement + since the statement (less any payments already made). */
function Tally({ items, soft }: { items: Array<[string, number | null]>; soft: string }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map(([label, cents]) => (
        <span key={label} className="min-w-0">
          <span className={`block truncate text-[10px] uppercase tracking-wide ${soft}`}>{label}</span>
          <span className="tnum block truncate text-xs font-semibold">{cents === null ? "—" : whole(cents)}</span>
        </span>
      ))}
    </div>
  );
}

function SummaryFace({ summary, cards }: { summary: DeckSummary; cards: DeckCard[] }) {
  const onStatements = cards.reduce((s, c) => s + (c.status?.dueCents ?? 0), 0);
  const since = cards.reduce((s, c) => s + (c.status?.newChargesCents ?? 0), 0);
  return (
    <div className="flex h-full flex-col justify-between bg-hero p-4 text-hero-text">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-semibold">All cards</span>
        <span className="text-[11px] text-hero-muted">{cards.length} {cards.length === 1 ? "card" : "cards"}</span>
      </div>
      <div>
        <p className="text-[11px] text-hero-muted">To pay this cycle{summary.nextDue ? ` · next ${short(summary.nextDue)}` : ""}</p>
        <p className="tnum text-[26px] font-bold leading-tight">{money(summary.payThisCycleCents)}</p>
      </div>
      <Tally soft="text-hero-muted" items={[["Balance", summary.totalOwedCents], ["Statements", onStatements], ["New", since]]} />
    </div>
  );
}

function CardFace({ card }: { card: DeckCard }) {
  const color = cardColor(card.color);
  const dark = color.ink === "dark";
  const ink = dark ? "text-[#15181d]" : "text-white";
  const soft = dark ? "text-black/60" : "text-white/70";
  const s = card.status;
  const lead = !s
    ? { label: "Balance", cents: card.owedNowCents }
    : s.plan === "paid"
      ? { label: `Nothing due · next ${short(s.nextDue)}`, cents: 0 }
      : { label: `${s.plan === "payoff" ? "Payoff payment" : "Pay"} by ${short(s.nextDue)}`, cents: s.suggestedCents };
  return (
    <div className={`flex h-full flex-col justify-between p-4 ${ink}`} style={{ background: color.background }}>
      <div className="flex items-start justify-between gap-2">
        <span className="min-w-0 truncate text-sm font-semibold tracking-wide">{faceName(card.name)}</span>
        {card.lastDigits ? <span className={`tnum shrink-0 text-[11px] ${soft}`}>•••• {card.lastDigits}</span> : null}
      </div>
      <div>
        <p className={`truncate text-[11px] ${soft}`}>{lead.label}</p>
        <p className="tnum text-[26px] font-bold leading-tight">{money(lead.cents)}</p>
      </div>
      {s ? (
        <div>
          <Tally soft={soft} items={[["Balance", card.owedNowCents], ["Statement", s.dueCents], ["New", s.newChargesCents]]} />
          {s.plan === "payoff" && s.promoEndsOn && s.paymentsLeft !== null ? (
            <p className={`mt-1 truncate text-[10px] ${soft}`}>0% until {long(s.promoEndsOn)} · {s.paymentsLeft} payments left</p>
          ) : null}
        </div>
      ) : (
        <p className={`text-[11px] ${soft}`}>Add its closing and due days on Accounts</p>
      )}
    </div>
  );
}

/** How far each card behind the front one sits to the side. */
const FAN = 16;
const EASE = "cubic-bezier(0.22, 0.9, 0.24, 1)";

export function CardDeck({ cards, summary }: { cards: DeckCard[]; summary: DeckSummary }) {
  // Position 0 is the summary; 1..n are the cards.
  const total = cards.length + 1;
  const [order, setOrder] = useState(() => Array.from({ length: total }, (_, i) => i));
  const [phase, setPhase] = useState<"rest" | "out" | "in">("rest");
  const [direction, setDirection] = useState<1 | -1>(1);
  const start = useRef<number | null>(null);
  const busy = phase !== "rest";

  useEffect(() => setOrder(Array.from({ length: total }, (_, i) => i)), [total]);

  /** The front card slides out, then tucks in at the back while the others step forward. */
  const next = useCallback(() => {
    if (busy || total < 2) return;
    setDirection(1);
    setPhase("out");
    setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setPhase("in");
      setTimeout(() => setPhase("rest"), 380);
    }, 230);
  }, [busy, total]);

  /** The back card slides out and comes round to the front. */
  const prev = useCallback(() => {
    if (busy || total < 2) return;
    setDirection(-1);
    setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]);
    setPhase("out");
    setTimeout(() => {
      setPhase("in");
      setTimeout(() => setPhase("rest"), 380);
    }, 30);
  }, [busy, total]);

  const front = order[0];
  const behind = Math.min(total - 1, 3);

  return (
    <div className="flex flex-col gap-2">
      <div
        id="card-stack"
        role="group"
        aria-roledescription="card stack"
        aria-label="Cards: tap, swipe or use the arrow keys to flip through"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === " " || e.key === "Enter") {
            e.preventDefault();
            next();
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            prev();
          }
        }}
        onPointerDown={(e) => (start.current = e.clientX)}
        onPointerUp={(e) => {
          const dx = start.current === null ? 0 : e.clientX - start.current;
          start.current = null;
          if (dx > 40) prev();
          else next();
        }}
        className="relative cursor-pointer select-none rounded-2xl outline-offset-4 touch-pan-y"
        style={{ marginRight: `${behind * FAN}px` }}
      >
        <div style={{ aspectRatio: "1.586" }} />
        {order.map((cardIndex, depth) => {
          const card = cardIndex === 0 ? null : cards[cardIndex - 1];
          // The card leaving the front swings out beside the stack before it goes to the back.
          const leaving = phase === "out" && direction === 1 && depth === 0;
          const arriving = phase === "out" && direction === -1 && depth === 0;
          const x = leaving || arriving ? 70 : 0;
          const transform =
            leaving || arriving
              ? `translateX(${x}%) rotate(${direction * 5}deg)`
              : `translateX(${Math.min(depth, 3) * FAN}px) scale(${1 - Math.min(depth, 3) * 0.035})`;
          return (
            <div
              key={cardIndex}
              aria-hidden={depth !== 0}
              className="absolute inset-0 origin-left overflow-hidden rounded-2xl shadow-[0_8px_22px_-10px_rgba(0,0,0,0.5)]"
              style={{
                transform,
                opacity: depth > 3 ? 0 : 1,
                zIndex: total - depth,
                transition: arriving ? "none" : `transform 380ms ${EASE}, opacity 380ms ${EASE}`,
              }}
            >
              {card ? <CardFace card={card} /> : <SummaryFace summary={summary} cards={cards} />}
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-center gap-1.5" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className={`h-1.5 rounded-full transition-all duration-300 ${i === front ? "w-4 bg-accent" : "w-1.5 bg-line-strong"}`} />
        ))}
      </div>
    </div>
  );
}

export function CardTable({ cards }: { cards: DeckCard[] }) {
  return (
    <section id="cards" className="scroll-mt-6 rounded-2xl border border-line bg-surface shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="text-base font-bold">Cards</h2>
        <a href="/settings/accounts" className="text-xs font-semibold text-accent-text hover:underline">
          Days and colors
        </a>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
              <th className="px-5 py-2 font-semibold">Card</th>
              <th className="px-3 py-2 text-right font-semibold">Balance</th>
              <th className="px-3 py-2 text-right font-semibold">On statement</th>
              <th className="px-3 py-2 text-right font-semibold">Since statement</th>
              <th className="px-5 py-2 text-right font-semibold">Pay this cycle</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {cards.map((c) => {
              const s = c.status;
              return (
                <tr key={c.id} className="align-top">
                  <td className="px-5 py-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <span aria-hidden className="h-3.5 w-5 shrink-0 rounded-[3px]" style={{ background: cardColor(c.color).background }} />
                      {faceName(c.name)}
                    </span>
                    <span className="block pl-7 text-xs text-muted">{c.institution ?? ""}</span>
                  </td>
                  <td className="tnum px-3 py-3 text-right">{money(c.owedNowCents)}</td>
                  <td className="tnum px-3 py-3 text-right">
                    {s ? (
                      <>
                        <span className="block">{money(s.dueCents)}</span>
                        <span className="block text-xs text-muted">due {short(s.nextDue)}</span>
                      </>
                    ) : (
                      <span className="text-xs text-muted">Add its days</span>
                    )}
                  </td>
                  <td className="tnum px-3 py-3 text-right">
                    {s ? (
                      <>
                        <span className="block">{money(s.newChargesCents)}</span>
                        <span className="block text-xs text-muted">next statement</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="tnum px-5 py-3 text-right">
                    {s ? (
                      <>
                        <span className="block font-semibold">{s.plan === "paid" ? "—" : money(s.suggestedCents)}</span>
                        <span className="block text-xs text-muted">
                          {s.plan === "payoff" && s.paymentsLeft !== null
                            ? `0% payoff · ${s.paymentsLeft} left`
                            : s.plan === "statement"
                              ? "in full, no interest"
                              : "nothing due"}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

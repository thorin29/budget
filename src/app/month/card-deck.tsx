"use client";

/**
 * Cards as a stack, like a wallet: a summary card on top, then each card in the
 * color the person picked. Tap the top card, use the arrows or ← →, or swipe,
 * and the top card moves to the back. A List view shows them side by side.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { formatCents } from "@/lib/money";
import { cardColor } from "@/lib/card-colors";

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
const faceName = (name: string) => name.replace(/[\s\-–]*\(?\.{0,3}\d{3,4}\)?\s*$/, "").trim() || name;
const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const long = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

function payLine(c: DeckCard): string {
  const s = c.status;
  if (!s) return "Add its closing and due days on Accounts";
  if (s.plan === "paid") return `Statement covered · next due ${short(s.nextDue)}`;
  return `Pay ${formatCents(s.suggestedCents)} by ${short(s.nextDue)}`;
}

function note(c: DeckCard): string | null {
  const s = c.status;
  if (!s) return null;
  if (s.plan === "payoff" && s.promoEndsOn && s.paymentsLeft !== null) return `0% ends ${long(s.promoEndsOn)} · ${s.paymentsLeft} payments left`;
  return `New since statement ${formatCents(s.newChargesCents)}`;
}

/** A generic chip, drawn so the face reads as a card. */
function Chip({ dark }: { dark: boolean }) {
  return (
    <span
      aria-hidden
      className={`block h-7 w-10 rounded-md border ${dark ? "border-black/20 bg-black/10" : "border-white/30 bg-white/20"}`}
      style={{ backgroundImage: "linear-gradient(90deg, transparent 45%, currentColor 45%, currentColor 55%, transparent 55%)", opacity: 0.6 }}
    />
  );
}

function Face({ card, summary, count }: { card: DeckCard | null; summary: DeckSummary; count: number }) {
  if (!card) {
    return (
      <div className="flex h-full flex-col justify-between bg-hero p-5 text-hero-text">
        <div className="flex items-start justify-between">
          <span className="text-sm font-semibold">All cards</span>
          <span className="text-xs text-hero-muted">{count} {count === 1 ? "card" : "cards"}</span>
        </div>
        <div>
          <p className="text-xs text-hero-muted">Owed now</p>
          <p className="tnum text-[28px] font-bold leading-tight">{formatCents(summary.totalOwedCents)}</p>
        </div>
        <div className="flex items-end justify-between gap-3 text-sm">
          <span>
            <span className="block text-xs text-hero-muted">Pay this cycle</span>
            <span className="tnum font-semibold">{formatCents(summary.payThisCycleCents)}</span>
          </span>
          {summary.nextDue ? (
            <span className="text-right">
              <span className="block text-xs text-hero-muted">Next due</span>
              <span className="font-semibold">{short(summary.nextDue)}</span>
            </span>
          ) : null}
        </div>
      </div>
    );
  }
  const color = cardColor(card.color);
  const dark = color.ink === "dark";
  const ink = dark ? "text-[#15181d]" : "text-white";
  const soft = dark ? "text-black/60" : "text-white/70";
  return (
    <div className={`flex h-full flex-col justify-between p-5 ${ink}`} style={{ background: color.background }}>
      <div className="flex items-start justify-between gap-3">
        <span className="min-w-0 truncate text-base font-semibold tracking-wide">{faceName(card.name)}</span>
        <span className={`shrink-0 text-xs ${soft}`}>{card.institution ?? ""}</span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className={`text-xs ${soft}`}>Owed now</p>
          <p className="tnum text-[28px] font-bold leading-tight">{formatCents(card.owedNowCents)}</p>
        </div>
        <Chip dark={dark} />
      </div>
      <div className="flex items-end justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate text-sm font-semibold">{payLine(card)}</span>
          {note(card) ? <span className={`block truncate text-xs ${soft}`}>{note(card)}</span> : null}
        </span>
        {card.lastDigits ? <span className={`tnum shrink-0 text-xs ${soft}`}>•••• {card.lastDigits}</span> : null}
      </div>
    </div>
  );
}

export function CardDeck({ cards, summary }: { cards: DeckCard[]; summary: DeckSummary }) {
  // Position 0 is the summary; 1..n are the cards.
  const total = cards.length + 1;
  const [order, setOrder] = useState(() => Array.from({ length: total }, (_, i) => i));
  const [leaving, setLeaving] = useState(false);
  const [view, setView] = useState<"stack" | "list">("stack");
  const start = useRef<number | null>(null);

  const next = useCallback(() => {
    if (leaving) return;
    setLeaving(true);
    setTimeout(() => {
      setOrder((o) => [...o.slice(1), o[0]]);
      setLeaving(false);
    }, 220);
  }, [leaving]);
  const prev = useCallback(() => setOrder((o) => [o[o.length - 1], ...o.slice(0, -1)]), []);

  useEffect(() => {
    setOrder(Array.from({ length: total }, (_, i) => i));
  }, [total]);

  const top = order[0];

  return (
    <section id="cards" className="scroll-mt-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold">Cards</h2>
        <div className="flex items-center gap-1 rounded-lg bg-neutral-soft p-0.5 text-xs font-semibold">
          {(["stack", "list"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={`rounded-md px-2.5 py-1 ${view === v ? "bg-surface text-foreground shadow-card" : "text-muted"}`}
            >
              {v === "stack" ? "Stack" : "List"}
            </button>
          ))}
        </div>
      </div>

      {view === "stack" ? (
        <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-8">
          <div
            role="group"
            aria-roledescription="card stack"
            aria-label="Cards"
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
              if (dx < -40) next();
              else if (dx > 40) prev();
              else next();
            }}
            className="relative w-full max-w-[340px] cursor-pointer select-none rounded-2xl outline-offset-4 touch-pan-y"
            style={{ aspectRatio: "1.586", marginBottom: `${Math.min(total - 1, 3) * 10}px` }}
          >
            {order
              .map((cardIndex, depth) => ({ cardIndex, depth }))
              .reverse()
              .map(({ cardIndex, depth }) => {
                const card = cardIndex === 0 ? null : cards[cardIndex - 1];
                const lifting = depth === 0 && leaving;
                const shown = depth <= 3;
                return (
                  <div
                    key={cardIndex}
                    aria-hidden={depth !== 0}
                    className="absolute inset-0 overflow-hidden rounded-2xl shadow-[0_10px_24px_-12px_rgba(0,0,0,0.45)] transition-[transform,opacity] duration-200 ease-out"
                    style={{
                      transform: lifting
                        ? "translateY(-18px) rotate(-3deg) scale(1.02)"
                        : `translateY(${depth * 10}px) scale(${1 - depth * 0.04})`,
                      opacity: lifting ? 0 : shown ? 1 : 0,
                      zIndex: total - depth,
                    }}
                  >
                    <Face card={card} summary={summary} count={cards.length} />
                  </div>
                );
              })}
          </div>

          <div className="w-full min-w-0 flex-1 text-sm">
            <div className="flex items-center gap-2">
              <button type="button" onClick={prev} aria-label="Previous card" className="rounded-lg border border-line px-2.5 py-1 hover:bg-neutral-soft">
                ‹
              </button>
              <button type="button" onClick={next} aria-label="Next card" className="rounded-lg border border-line px-2.5 py-1 hover:bg-neutral-soft">
                ›
              </button>
              <span className="ml-1 flex gap-1.5" aria-hidden>
                {Array.from({ length: total }, (_, i) => (
                  <span key={i} className={`h-1.5 w-1.5 rounded-full ${i === top ? "bg-accent" : "bg-line-strong"}`} />
                ))}
              </span>
            </div>
            <p className="mt-3 text-xs text-muted">
              Tap the card, swipe, or use ← → to flip through. Pick each card&rsquo;s color on the Accounts page.
            </p>
            {top !== 0 && cards[top - 1]?.status ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted">Statement</dt>
                <dd className="tnum text-right">{formatCents(cards[top - 1].status!.statementCents)}</dd>
                <dt className="text-muted">Left to pay on it</dt>
                <dd className="tnum text-right">{formatCents(cards[top - 1].status!.dueCents)}</dd>
                <dt className="text-muted">New since statement</dt>
                <dd className="tnum text-right">{formatCents(cards[top - 1].status!.newChargesCents)}</dd>
              </dl>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[600px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs font-semibold uppercase tracking-wide text-muted">
                <th className="py-2 pr-3 font-semibold">Card</th>
                <th className="px-3 py-2 text-right font-semibold">Owed now</th>
                <th className="px-3 py-2 text-right font-semibold">Statement left</th>
                <th className="px-3 py-2 text-right font-semibold">New since</th>
                <th className="py-2 pl-3 text-right font-semibold">Pay</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {cards.map((c) => (
                <tr key={c.id} className="align-top">
                  <td className="py-2.5 pr-3">
                    <span className="flex items-center gap-2 font-semibold">
                      <span aria-hidden className="h-3 w-5 rounded-sm" style={{ background: cardColor(c.color).background }} />
                      {faceName(c.name)}
                    </span>
                  </td>
                  <td className="tnum px-3 py-2.5 text-right">{formatCents(c.owedNowCents)}</td>
                  <td className="tnum px-3 py-2.5 text-right">{c.status ? formatCents(c.status.dueCents) : "—"}</td>
                  <td className="tnum px-3 py-2.5 text-right">{c.status ? formatCents(c.status.newChargesCents) : "—"}</td>
                  <td className="tnum py-2.5 pl-3 text-right">
                    {c.status && c.status.plan !== "paid" ? (
                      <>
                        <span className="block font-semibold">{formatCents(c.status.suggestedCents)}</span>
                        <span className="block text-xs text-muted">by {short(c.status.nextDue)}</span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

"use client";

/**
 * The Income vs expenses ring. Click (or tap, or focus and press Enter) a part of it and the
 * middle shows that part; click it again, or the middle, to go back to what's remaining.
 */

import { useState } from "react";

const money = (cents: number) => `${cents < 0 ? "−" : ""}$${Math.abs(Math.round(cents / 100)).toLocaleString("en-US")}`;

export interface RingSeg {
  key: string;
  label: string;
  cents: number;
  color: string;
  /** Still due: drawn pale. */
  due: boolean;
  /** "spent", "paid" or "still due". */
  verb: string;
}

/** An open arc on a circle centered at (c, c) from `from` to `to` thousandths of a turn, for use inside rotate(-90). */
function ringArc(c: number, r: number, from: number, to: number) {
  const a = (t: number) => (t / 1000) * 2 * Math.PI;
  const p = (t: number) => `${(c + r * Math.cos(a(t))).toFixed(2)} ${(c + r * Math.sin(a(t))).toFixed(2)}`;
  return `M ${p(from)} A ${r} ${r} 0 ${to - from > 500 ? 1 : 0} 1 ${p(to)}`;
}

export function IncomeRing({ segs, income, received, left }: { segs: RingSeg[]; income: number; received: number; left: number }) {
  const [picked, setPicked] = useState<string | null>(null);
  const out = segs.reduce((t, g) => t + g.cents, 0);
  const scale = Math.max(1, income || out);
  const S = 300, C = S / 2, R_IN = 96, W_IN = 30, R_OUT = 127, W_OUT = 14, R_OVER = 144;
  const turn = (c: number) => (c / scale) * 1000;
  let at0 = 0;
  const arcs = segs.map((g) => {
    const from = Math.min(1000, at0);
    const len = Math.max(0, Math.min(1000, at0 + turn(g.cents)) - from - (segs.length > 1 ? 2 : 0));
    at0 += turn(g.cents);
    return { ...g, from, len };
  });
  const tick = Math.min(1, received / scale) * 2 * Math.PI;
  const tx = (r: number) => C + r * Math.sin(tick);
  const ty = (r: number) => C - r * Math.cos(tick);

  const toggle = (key: string) => setPicked((p) => (p === key ? null : key));
  const press = (key: string) => ({
    role: "button",
    tabIndex: 0,
    style: { cursor: "pointer", outline: "none" },
    onClick: () => toggle(key),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggle(key);
      }
      if (e.key === "Escape") setPicked(null);
    },
  });
  const dim = (key: string) => (picked && picked !== key ? 0.35 : 1);

  // The middle: what's picked, or what's remaining.
  const seg = arcs.find((g) => g.key === picked);
  const middle =
    picked === "income"
      ? { big: money(received), small: `income received of ${money(income)}`, tone: "fill-foreground" }
      : picked === "left"
        ? { big: money(left), small: "remaining", tone: "fill-foreground" }
        : picked === "over"
          ? { big: money(-left), small: "past income", tone: "fill-danger" }
          : seg
            ? { big: money(seg.cents), small: `${seg.label.toLowerCase()} ${seg.verb}`, tone: "fill-foreground" }
            : left < 0
              ? { big: `${money(-left)} over`, small: "expenses pass income", tone: "fill-danger" }
              : { big: money(left), small: "remaining", tone: "fill-foreground" };

  return (
    <svg
      viewBox={`0 0 ${S} ${S}`}
      className="mx-auto w-64 select-none"
      role="group"
      aria-label={`Income ${money(received)} of ${money(income)} received; ${left >= 0 ? `${money(left)} remaining` : `${money(-left)} over income`}. Pick a part of the ring to see it in the middle.`}
    >
      <g transform={`rotate(-90 ${C} ${C})`} fill="none">
        <circle cx={C} cy={C} r={R_OUT} stroke="var(--border)" strokeWidth={W_OUT} pathLength={1000} />
        <circle cx={C} cy={C} r={R_OUT} stroke="var(--foreground)" strokeWidth={W_OUT} pathLength={1000} strokeDasharray={`${turn(received)} 1000`} opacity={dim("income")} {...press("income")}>
          <title>{`Income received: ${money(received)} of ${money(income)}`}</title>
        </circle>
        {arcs.map((g) => (
          <circle
            key={g.key}
            cx={C}
            cy={C}
            r={R_IN}
            stroke={g.color}
            strokeOpacity={g.due ? 0.3 : 1}
            strokeWidth={picked === g.key ? W_IN + 6 : W_IN}
            pathLength={1000}
            strokeDasharray={`${g.len} 1000`}
            strokeDashoffset={-g.from}
            opacity={dim(g.key)}
            {...press(g.key)}
          >
            <title>{`${g.label} ${g.verb}: ${money(g.cents)}`}</title>
          </circle>
        ))}
        {left > 0 ? (
          <g opacity={dim("left")} {...press("left")}>
            <title>{`Remaining: ${money(left)}`}</title>
            <path d={ringArc(C, R_IN, Math.min(1000, at0) + 2, 1000)} stroke="var(--muted)" strokeWidth={W_IN} strokeDasharray="2 3" opacity={0.6} />
            <path d={ringArc(C, R_IN, Math.min(1000, at0) + 2, 1000)} stroke="transparent" strokeWidth={W_IN} pointerEvents="stroke" />
          </g>
        ) : null}
        {left < 0 ? (
          <circle cx={C} cy={C} r={R_OVER} stroke="var(--danger)" strokeWidth={7} strokeLinecap="round" pathLength={1000} strokeDasharray={`${Math.min(1000, turn(-left))} 1000`} opacity={dim("over")} {...press("over")}>
            <title>{`Over income: ${money(-left)}`}</title>
          </circle>
        ) : null}
      </g>
      {income > 0 ? <line x1={tx(R_IN - W_IN / 2 - 4)} y1={ty(R_IN - W_IN / 2 - 4)} x2={tx(R_OUT + W_OUT / 2 + 2)} y2={ty(R_OUT + W_OUT / 2 + 2)} stroke="var(--foreground)" strokeWidth="2.5" pointerEvents="none" /> : null}
      <g onClick={() => setPicked(null)} style={{ cursor: picked ? "pointer" : "default" }}>
        <circle cx={C} cy={C} r={R_IN - W_IN / 2 - 2} fill="transparent" />
        <text x={C} y={C - 2} textAnchor="middle" fontSize="28" fontWeight="700" className={middle.tone}>
          {middle.big}
        </text>
        <text x={C} y={C + 20} textAnchor="middle" fontSize="12" className={middle.tone === "fill-danger" ? "fill-danger" : "fill-muted"}>
          {middle.small}
        </text>
      </g>
    </svg>
  );
}

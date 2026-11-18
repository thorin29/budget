/** What the Insights tabs share: the month being looked at and its picker. */

import Link from "next/link";

export function localMonth(): { year: number; month: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: process.env.TZ || "UTC", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  return { year: Number(parts.find((p) => p.type === "year")?.value), month: Number(parts.find((p) => p.type === "month")?.value) };
}

export function shiftMonth(year: number, month: number, by: number) {
  const n = year * 12 + month - 1 + by;
  return { year: Math.floor(n / 12), month: (n % 12) + 1 };
}

export const monthParam = (p: { year: number; month: number }) => `${p.year}-${String(p.month).padStart(2, "0")}`;

export const monthLabel = (year: number, month: number, style: "long" | "short" = "long") =>
  new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString("en-US", { month: style, ...(style === "long" ? { year: "numeric" } : {}), timeZone: "UTC" });

/** The month in `?m=YYYY-MM`, never one that hasn't started; this month by default. */
export function pickMonth(m: string | undefined) {
  const now = localMonth();
  const match = /^(\d{4})-(\d{2})$/.exec(m ?? "");
  const asked = match ? { year: Number(match[1]), month: Number(match[2]) } : now;
  const picked = asked.month >= 1 && asked.month <= 12 && asked.year * 12 + asked.month <= now.year * 12 + now.month ? asked : now;
  return { ...picked, isNow: picked.year === now.year && picked.month === now.month };
}

export function MonthPicker({ path, year, month }: { path: string; year: number; month: number }) {
  const now = localMonth();
  const prev = shiftMonth(year, month, -1);
  const next = shiftMonth(year, month, 1);
  const atNow = year === now.year && month === now.month;
  return (
    <div className="flex items-center gap-1 rounded-xl border border-line bg-surface p-1 text-sm">
      <Link href={`${path}?m=${monthParam(prev)}`} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
        ‹ {monthLabel(prev.year, prev.month, "short")}
      </Link>
      <span className="px-2.5 py-1 font-semibold">{monthLabel(year, month)}</span>
      {atNow ? (
        <span className="px-2.5 py-1 text-muted/50">{monthLabel(next.year, next.month, "short")} ›</span>
      ) : (
        <Link href={`${path}?m=${monthParam(next)}`} className="rounded-lg px-2.5 py-1 text-muted hover:bg-neutral-soft">
          {monthLabel(next.year, next.month, "short")} ›
        </Link>
      )}
    </div>
  );
}

/** A tab's heading: its title, one line on what it answers, and the month picker where it applies. */
export function TabHeading({ title, description, picker }: { title: string; description: string; picker?: { path: string; year: number; month: number } }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted">{description}</p>
      </div>
      {picker ? <MonthPicker {...picker} /> : null}
    </div>
  );
}

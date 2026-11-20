/**
 * Items that share a name (three paychecks from one employer, a payment made twice a month) keep
 * one name and get a short tag so they can be told apart: the payday ("1st", "2nd") for paychecks
 * tied to one, else the due day ("1st", "23rd").
 */

const ordinal = (n: number) => {
  const s = n % 100 >= 11 && n % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${s}`;
};

export interface Nameable {
  id: string;
  name: string;
  dueDay?: number | null;
  paydayNumber?: number | null;
  active?: boolean;
}

/** Display names by id: the name alone when it's unique among active items, else name · tag. */
export function sameNameTags(items: Nameable[]): Map<string, string> {
  const groups = new Map<string, Nameable[]>();
  for (const i of items) if (i.active !== false) groups.set(i.name.trim().toLowerCase(), [...(groups.get(i.name.trim().toLowerCase()) ?? []), i]);
  const out = new Map<string, string>();
  for (const i of items) out.set(i.id, i.name);
  for (const list of groups.values()) {
    if (list.length < 2) continue;
    const byPayday = list.every((i) => i.paydayNumber) && new Set(list.map((i) => i.paydayNumber)).size === list.length;
    const byDue = list.every((i) => i.dueDay) && new Set(list.map((i) => i.dueDay)).size === list.length;
    list.forEach((i, n) => {
      const tag = byPayday ? `${ordinal(i.paydayNumber!)} paycheck` : byDue ? ordinal(i.dueDay!) : `#${n + 1}`;
      out.set(i.id, `${i.name} · ${tag}`);
    });
  }
  return out;
}

/**
 * Net worth: what you own (bank balances that aren't debt, plus values you enter, like a home or a
 * car) less what you owe (every loan and card, from the Debt tab). Each month's figure is kept as
 * it goes, so the trend builds over time.
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { toCents } from "@/lib/money";
import { getDebt } from "./debt";
import { ValidationError } from "./errors";

const KEY_ASSETS = "ownedAssets";
const OWNED_TYPES = new Set(["CHECKING", "SAVINGS", "INVESTMENT", "RETIREMENT", "CRYPTO", "OTHER"]);

export interface OwnedAsset {
  id: string;
  name: string;
  cents: number;
}

export interface OwnGroup {
  name: string;
  cents: number;
  items: Array<{ name: string; cents: number }>;
  /** A value you entered (a home, a car), not a bank account. */
  entered: boolean;
  /** For an entered value: its id ("home" or "home-…" for a home in Property Management). */
  id?: string;
}

export interface NetWorthView {
  own: Array<{ name: string; cents: number; entered: boolean; id?: string }>;
  /** What you own, grouped: cash, retirement, investments, crypto, then each value you entered. */
  groups: OwnGroup[];
  /** A home value you entered, less the mortgage: null without both. */
  homeEquity: { valueCents: number; mortgageCents: number; equityCents: number } | null;
  ownCents: number;
  owe: Array<{ name: string; cents: number }>;
  oweCents: number;
  netCents: number;
  /** Month by month, oldest first, from the saved figures. */
  history: Array<{ month: string; netCents: number }>;
}

export async function ownedAssets(): Promise<OwnedAsset[]> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY_ASSETS } })) as { value: unknown } | null;
  return Array.isArray(row?.value) ? (row!.value as OwnedAsset[]) : [];
}

const assetsInput = z.array(z.object({ id: z.string().min(1).max(40), name: z.string().trim().min(1).max(60), cents: z.number().int().min(0).max(1e12) })).max(30);

export async function saveOwnedAssets(list: OwnedAsset[]): Promise<void> {
  const parsed = assetsInput.safeParse(list);
  if (!parsed.success) throw new ValidationError({ assets: ["Each value needs a name and an amount"] });
  await prisma.setting.upsert({ where: { key: KEY_ASSETS }, create: { key: KEY_ASSETS, value: parsed.data as never }, update: { value: parsed.data as never } });
}

const CRYPTO = /\b(wallet|staked|btc|eth|sol|xrp|usdc|usdt|doge|dimo|coin|crypto|bitcoin|ethereum)\b/i;
const RETIRE = /401\s*\(?k\)?|\bira\b|roth|thrift savings|\btsp\b|403\s*\(?b\)?|pension|retirement/i;

/** Which group a bank account's balance belongs to. */
function groupOf(type: string, name: string): string {
  if (type === "CHECKING" || type === "SAVINGS") return "Cash";
  if (type === "RETIREMENT" || RETIRE.test(name)) return "Retirement";
  if (type === "CRYPTO" || CRYPTO.test(name)) return "Crypto";
  if (type === "INVESTMENT") return "Investments";
  return /saving|checking|money market/i.test(name) ? "Cash" : "Other";
}
const GROUP_ORDER = ["Cash", "Retirement", "Investments", "Crypto", "Other"];

/**
 * A readable account name: feed ids in brackets dropped, a repeated last-four shown once, and
 * retirement plans called what they are.
 */
export function friendlyName(raw: string): string {
  if (/401\s*\(?k\)?/i.test(raw)) return "401(k)";
  if (/thrift savings/i.test(raw)) return "Thrift Savings Plan";
  if (/\broth\b/i.test(raw)) return "Roth IRA";
  let s = raw.replace(/\s*\([0-9a-f-]{12,}\)?.*$/i, "").replace(/\s*\([0-9a-f]{8}-[^)]*\)?/gi, "");
  const four = s.match(/\((\d{3,4})\)\s*$/);
  if (four) {
    s = s.replace(/\s*\(\d{3,4}\)\s*$/, "");
    if (!s.includes(four[1])) s = `${s} ··${four[1]}`;
  }
  s = s.replace(/\s*-\s*(\d{3,4})\b/, " ··$1").replace(/\.{2,}\s*(\d{3,4})/, "··$1").replace(/\s{2,}/g, " ").trim();
  return s || raw;
}

const ym = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

/** Works out net worth now and saves it as this month's figure. */
export async function getNetWorth(debtPaymentCents: number): Promise<NetWorthView> {
  const [accounts, assets, debt] = await Promise.all([
    prisma.bankAccount.findMany({ where: { hidden: false }, select: { name: true, nickname: true, type: true, balance: true } }) as Promise<
      Array<{ name: string; nickname: string | null; type: string; balance: { toString(): string } | null }>
    >,
    ownedAssets(),
    getDebt(debtPaymentCents),
  ]);
  const own = [
    ...accounts
      .filter((a) => OWNED_TYPES.has(a.type) && a.balance !== null && toCents(a.balance) > 0)
      .map((a) => ({ name: a.nickname || a.name, cents: toCents(a.balance!), entered: false })),
    ...assets.map((a) => ({ name: a.name, cents: a.cents, entered: true, id: a.id })),
  ];
  const owe = [...debt.installment.map((d) => ({ name: d.name, cents: d.balanceCents })), ...debt.revolving.filter((c) => c.balanceCents > 0).map((c) => ({ name: c.name, cents: c.balanceCents }))];
  const ownCents = own.reduce((t, a) => t + a.cents, 0);
  const banks = new Map<string, Array<{ name: string; cents: number }>>();
  for (const a of accounts.filter((x) => OWNED_TYPES.has(x.type) && x.balance !== null && toCents(x.balance) > 0)) {
    const g = groupOf(a.type, `${a.nickname ?? ""} ${a.name}`);
    banks.set(g, [...(banks.get(g) ?? []), { name: a.nickname || friendlyName(a.name), cents: toCents(a.balance!) }]);
  }
  const groups: OwnGroup[] = [
    ...GROUP_ORDER.filter((g) => banks.has(g)).map((g) => {
      const items = banks.get(g)!.sort((x, y) => y.cents - x.cents);
      return { name: g, cents: items.reduce((s, i) => s + i.cents, 0), items, entered: false };
    }),
    ...assets.map((a) => ({ name: a.name, cents: a.cents, items: [], entered: true, id: a.id })),
  ];
  // Equity: the first home in Property Management (the one the mortgage is for).
  const home = assets.find((a) => a.id === "home") ?? assets.find((a) => /home|house|condo|property/i.test(a.name));
  const mortgage = debt.installment.filter((d) => /mortgage|home loan|heloc/i.test(d.name)).reduce((s, d) => s + d.balanceCents, 0);
  const homeEquity = home && mortgage ? { valueCents: home.cents, mortgageCents: mortgage, equityCents: home.cents - mortgage } : null;
  const oweCents = debt.totalCents;
  const month = ym();
  await prisma.netWorthSnapshot
    .upsert({ where: { month }, create: { month, ownCents: BigInt(ownCents), oweCents: BigInt(oweCents) }, update: { ownCents: BigInt(ownCents), oweCents: BigInt(oweCents) } })
    .catch((error: unknown) => console.error("Net worth snapshot:", error instanceof Error ? error.message : error));
  const saved = (await prisma.netWorthSnapshot.findMany({ orderBy: { month: "asc" }, take: 240 }).catch(() => [])) as Array<{ month: string; ownCents: bigint; oweCents: bigint }>;
  const history = saved.slice(-12).map((s) => ({ month: s.month, netCents: Number(s.ownCents - s.oweCents) }));
  return { own, groups, homeEquity, ownCents, owe, oweCents, netCents: ownCents - oweCents, history };
}

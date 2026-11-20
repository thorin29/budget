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

export interface NetWorthView {
  own: Array<{ name: string; cents: number; entered: boolean; id?: string }>;
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
  const oweCents = debt.totalCents;
  const month = ym();
  await prisma.netWorthSnapshot
    .upsert({ where: { month }, create: { month, ownCents: BigInt(ownCents), oweCents: BigInt(oweCents) }, update: { ownCents: BigInt(ownCents), oweCents: BigInt(oweCents) } })
    .catch((error: unknown) => console.error("Net worth snapshot:", error instanceof Error ? error.message : error));
  const saved = (await prisma.netWorthSnapshot.findMany({ orderBy: { month: "asc" }, take: 240 }).catch(() => [])) as Array<{ month: string; ownCents: bigint; oweCents: bigint }>;
  const history = saved.slice(-12).map((s) => ({ month: s.month, netCents: Number(s.ownCents - s.oweCents) }));
  return { own, ownCents, owe, oweCents, netCents: ownCents - oweCents, history };
}

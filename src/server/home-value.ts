/**
 * The home's value from RentCast (an estimate by address), kept as the "Home" value in net worth.
 * The address and API key are saved in Setup (the key sealed with BANK_SYNC_KEY); the value
 * refreshes once a month on its own, or now from Setup. The free RentCast plan allows a limited
 * number of lookups a month, so it's never asked more than once a day.
 */

import { prisma } from "@/lib/prisma";
import { configuredKey, open, seal, MissingKeyError } from "@/lib/secret-box";
import { BankFeedError } from "@/lib/simplefin";
import { rentcastGet } from "./bank/simplefin-client";
import { ownedAssets, saveOwnedAssets } from "./net-worth";
import { ValidationError } from "./errors";

const KEY = "homeValue";
const PURPOSE = "rentcast";
const DAY = 86_400_000;

interface Stored {
  address: string;
  keyEnc: string | null;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
}

export interface HomeValueView {
  address: string;
  hasKey: boolean;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
}

async function load(): Promise<Stored | null> {
  const row = (await prisma.setting.findUnique({ where: { key: KEY } })) as { value: unknown } | null;
  return row?.value && typeof row.value === "object" ? (row.value as Stored) : null;
}
async function store(v: Stored) {
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: v as never }, update: { value: v as never } });
}

export async function homeValue(): Promise<HomeValueView | null> {
  const s = await load();
  return s ? { address: s.address, hasKey: !!s.keyEnc, valueCents: s.valueCents, lowCents: s.lowCents, highCents: s.highCents, fetchedAt: s.fetchedAt, error: s.error } : null;
}

/** Saves the address and (when given) a new API key, then looks the value up. */
export async function saveHomeValueSetup(address: string, apiKey: string | null): Promise<HomeValueView> {
  const a = address.trim();
  if (a.length < 8 || a.length > 200) throw new ValidationError({ address: ["Enter the full address: street, city, state and ZIP"] });
  const secret = configuredKey();
  if (!secret) throw new MissingKeyError();
  const old = await load();
  const keyEnc = apiKey && apiKey.trim() ? seal(apiKey.trim(), secret, PURPOSE) : (old?.keyEnc ?? null);
  if (!keyEnc) throw new ValidationError({ apiKey: ["Paste your RentCast API key"] });
  await store({ address: a, keyEnc, valueCents: old?.address === a ? old.valueCents : null, lowCents: null, highCents: null, fetchedAt: old?.address === a ? old.fetchedAt : null, error: null });
  return (await refreshHomeValue(true))!;
}

/** Looks the value up when it's a month old (or now, when forced but not twice in a day). */
export async function refreshHomeValue(force = false): Promise<HomeValueView | null> {
  const s = await load();
  if (!s?.keyEnc || !s.address) return null;
  const age = s.fetchedAt ? Date.now() - Date.parse(s.fetchedAt) : Infinity;
  if (age < (force ? DAY / 24 : 30 * DAY)) return homeValue();
  const secret = configuredKey();
  if (!secret) return homeValue();
  try {
    const json = (await rentcastGet("/v1/avm/value", { address: s.address }, open(s.keyEnc, secret, PURPOSE))) as { price?: number; priceRangeLow?: number; priceRangeHigh?: number };
    if (typeof json.price !== "number" || json.price <= 0) throw new BankFeedError("RentCast has no estimate for that address");
    const valueCents = Math.round(json.price * 100);
    await store({ ...s, valueCents, lowCents: json.priceRangeLow ? Math.round(json.priceRangeLow * 100) : null, highCents: json.priceRangeHigh ? Math.round(json.priceRangeHigh * 100) : null, fetchedAt: new Date().toISOString(), error: null });
    // Net worth's "Home" value follows the estimate.
    const assets = await ownedAssets();
    const i = assets.findIndex((x) => /^(home|house)\b/i.test(x.name));
    if (i >= 0) assets[i] = { ...assets[i], cents: valueCents };
    else assets.unshift({ id: "home", name: "Home", cents: valueCents });
    await saveOwnedAssets(assets);
  } catch (error) {
    await store({ ...s, fetchedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Lookup failed" });
  }
  return homeValue();
}

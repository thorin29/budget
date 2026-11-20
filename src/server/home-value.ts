/**
 * The home's value: estimates you type in (Zillow, Redfin, the county…) and one from RentCast by
 * address, blended into the "Home" value in net worth. Only current estimates count: a site's for
 * six months, the county's for fifteen (it updates yearly), RentCast's for 45 days. With none
 * current, the newest one stands. Every value entered or looked up is kept with its date.
 * The API key comes from RENTCAST_API_KEY in the server's environment when set (preferred: it
 * never touches the database), otherwise from Setup (sealed with BANK_SYNC_KEY). Lookups are kept
 * far under RentCast's free 50 a month: one automatic lookup a month, a manual one at most once a
 * day, and never more than MAX_PER_MONTH in a calendar month however they're asked for.
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
const MAX_PER_MONTH = 5;
const envKey = () => (process.env.RENTCAST_API_KEY ?? "").trim() || null;
const MONTH = 30.44 * DAY;
const yearlySource = (s: string) => /county|apprais|assess|\bcad\b|tax/i.test(s);

/** The Home value from what's current (see the top of the file), and which sources it used. */
export function blend(s: Pick<Stored, "estimates" | "valueCents" | "fetchedAt">, now = Date.now()): { cents: number | null; used: string[] } {
  const all = [
    ...(s.estimates ?? []).map((e) => ({ source: e.source, cents: e.cents, at: Date.parse(`${e.on}T00:00:00Z`), keep: (yearlySource(e.source) ? 15 : 6) * MONTH })),
    ...(s.valueCents && s.fetchedAt ? [{ source: "RentCast", cents: s.valueCents, at: Date.parse(s.fetchedAt), keep: 45 * DAY }] : []),
  ];
  if (!all.length) return { cents: null, used: [] };
  const current = all.filter((e) => now - e.at <= e.keep);
  if (current.length) return { cents: Math.round(current.reduce((t, e) => t + e.cents, 0) / current.length), used: current.map((e) => e.source) };
  const newest = all.reduce((a, b) => (b.at > a.at ? b : a));
  return { cents: newest.cents, used: [newest.source] };
}

interface Stored {
  address: string;
  keyEnc: string | null;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
  /** Lookups made this calendar month, to stay far under the plan's limit. */
  calls?: { month: string; count: number };
  /** Estimates typed in, one per source. */
  estimates?: HomeEstimate[];
  /** Every value entered or looked up, oldest first. */
  history?: HomeEstimate[];
}

export interface HomeEstimate {
  source: string;
  cents: number;
  /** YYYY-MM-DD it was entered. */
  on: string;
}

export interface HomeValueView {
  /** The key is set in the server's environment. */
  keyFromEnv: boolean;
  /** A key is saved in the database (from Setup). */
  keySaved: boolean;
  callsThisMonth: number;
  callsLimit: number;
  estimates: HomeEstimate[];
  /** The average of the estimates, or null without any. */
  averageCents: number | null;
  /** The Home value net worth uses, and which estimates went into it. */
  usedCents: number | null;
  usedSources: string[];
  history: HomeEstimate[];
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
  const estimates = s?.estimates ?? [];
  const averageCents = estimates.length ? Math.round(estimates.reduce((t, e) => t + e.cents, 0) / estimates.length) : null;
  const month = new Date().toISOString().slice(0, 7);
  const calls = s?.calls?.month === month ? s.calls.count : 0;
  const b = s ? blend(s) : { cents: null, used: [] };
  if (!s && envKey()) return { keyFromEnv: true, keySaved: false, callsThisMonth: 0, callsLimit: MAX_PER_MONTH, estimates: [], averageCents: null, usedCents: null, usedSources: [], history: [], address: "", hasKey: true, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null };
  return s ? { keyFromEnv: !!envKey(), keySaved: !!s.keyEnc, callsThisMonth: calls, callsLimit: MAX_PER_MONTH, estimates, averageCents, usedCents: b.cents, usedSources: b.used, history: s.history ?? [], address: s.address, hasKey: !!s.keyEnc || !!envKey(), valueCents: s.valueCents, lowCents: s.lowCents, highCents: s.highCents, fetchedAt: s.fetchedAt, error: s.error } : null;
}

/** Saves the address and (when given) a new API key, then looks the value up. */
export async function saveHomeValueSetup(address: string, apiKey: string | null): Promise<HomeValueView> {
  const a = address.trim();
  if (a.length < 8 || a.length > 200) throw new ValidationError({ address: ["Enter the full address: street, city, state and ZIP"] });
  const old = await load();
  let keyEnc = old?.keyEnc ?? null;
  if (apiKey && apiKey.trim() && !envKey()) {
    const secret = configuredKey();
    if (!secret) throw new MissingKeyError();
    keyEnc = seal(apiKey.trim(), secret, PURPOSE);
  }
  if (!keyEnc && !envKey()) throw new ValidationError({ apiKey: ["Paste your RentCast API key, or set RENTCAST_API_KEY on the server"] });
  const sameAddress = old?.address === a;
  await store({ ...(old ?? {}), address: a, keyEnc, valueCents: sameAddress ? (old?.valueCents ?? null) : null, lowCents: sameAddress ? (old?.lowCents ?? null) : null, highCents: sameAddress ? (old?.highCents ?? null) : null, fetchedAt: sameAddress ? (old?.fetchedAt ?? null) : null, error: null, estimates: old?.estimates ?? [] });
  return (await refreshHomeValue(true))!;
}

/** Looks the value up when it's a month old (or now, when forced but not twice in a day). */
export async function refreshHomeValue(force = false): Promise<HomeValueView | null> {
  const s = await load();
  if (!s) return null;
  // Estimates age out on their own, so the Home value is re-blended on every run (no lookup).
  await applyBlend(s);
  if (!s.address || (!s.keyEnc && !envKey())) return homeValue();
  const age = s.fetchedAt ? Date.now() - Date.parse(s.fetchedAt) : Infinity;
  if (age < (force ? DAY : 30 * DAY)) return homeValue();
  const month = new Date().toISOString().slice(0, 7);
  const used = s.calls?.month === month ? s.calls.count : 0;
  if (used >= MAX_PER_MONTH) return homeValue();
  let key = envKey();
  if (!key) {
    const secret = configuredKey();
    if (!secret || !s.keyEnc) return homeValue();
    key = open(s.keyEnc, secret, PURPOSE);
  }
  // Counted before asking, so a failed lookup still counts against the cap.
  s.calls = { month, count: used + 1 };
  await store(s);
  try {
    const json = (await rentcastGet("/v1/avm/value", { address: s.address }, key)) as { price?: number; priceRangeLow?: number; priceRangeHigh?: number };
    if (typeof json.price !== "number" || json.price <= 0) throw new BankFeedError("RentCast has no estimate for that address");
    const valueCents = Math.round(json.price * 100);
    const fetchedAt = new Date().toISOString();
    const next = { ...s, valueCents, lowCents: json.priceRangeLow ? Math.round(json.priceRangeLow * 100) : null, highCents: json.priceRangeHigh ? Math.round(json.priceRangeHigh * 100) : null, fetchedAt, error: null, history: [...(s.history ?? []), { source: "RentCast", cents: valueCents, on: fetchedAt.slice(0, 10) }].slice(-200) };
    await store(next);
    await applyBlend(next);
  } catch (error) {
    await store({ ...s, fetchedAt: new Date().toISOString(), error: error instanceof Error ? error.message : "Lookup failed" });
  }
  return homeValue();
}

async function setHomeAsset(cents: number) {
  const assets = await ownedAssets();
  const i = assets.findIndex((x) => /^(home|house)\b/i.test(x.name));
  if (i >= 0 && assets[i].cents === cents) return;
  if (i >= 0) assets[i] = { ...assets[i], cents };
  else assets.unshift({ id: "home", name: "Home", cents });
  await saveOwnedAssets(assets);
}

async function applyBlend(s: Stored) {
  const b = blend(s);
  if (b.cents !== null) await setHomeAsset(b.cents);
}

/** Forgets the API key saved in Setup (one in the server's environment stays). */
export async function clearHomeKey(): Promise<void> {
  const s = await load();
  if (s) await store({ ...s, keyEnc: null });
}

/** Saves the estimates typed in; their average becomes the Home value. */
export async function saveHomeEstimates(list: Array<{ source: string; cents: number }>, address?: string): Promise<HomeValueView> {
  const clean = list
    .map((e) => ({ source: e.source.trim().slice(0, 40), cents: Math.round(e.cents) }))
    .filter((e) => e.source && Number.isFinite(e.cents) && e.cents > 0 && e.cents < 1e12);
  if (clean.length > 8) throw new ValidationError({ estimates: ["Up to 8 estimates"] });
  const old = await load();
  const before = new Map((old?.estimates ?? []).map((e) => [e.source.toLowerCase(), e]));
  const today = new Date().toISOString().slice(0, 10);
  // A source whose amount didn't change keeps the date it was entered.
  const estimates = clean.map((e) => {
    const had = before.get(e.source.toLowerCase());
    return { ...e, on: had && had.cents === e.cents ? had.on : today };
  });
  await store({ ...(old ?? { keyEnc: null, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null }), address: address?.trim().slice(0, 200) || old?.address || "", estimates });
  // Values that are new or changed go into the history with today's date.
  const changed = estimates.filter((e) => {
    const had = before.get(e.source.toLowerCase());
    return !had || had.cents !== e.cents;
  });
  const saved = await load();
  if (saved) {
    saved.history = [...(saved.history ?? []), ...changed].slice(-200);
    await store(saved);
    await applyBlend(saved);
  }
  return (await homeValue())!;
}

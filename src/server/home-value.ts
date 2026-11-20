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

/**
 * The Home value from what's current (see the top of the file), and which sources it used. Each
 * source counts once, with its newest value: one typed in now, or a past one added to the history.
 */
export function blend(s: Pick<Stored, "estimates" | "valueCents" | "fetchedAt"> & { history?: HomeEstimate[] }, now = Date.now()): { cents: number | null; used: string[] } {
  const entries = [
    ...(s.estimates ?? []).map((e) => ({ source: e.source, cents: e.cents, at: Date.parse(`${e.on}T00:00:00Z`), keep: (yearlySource(e.source) ? 15 : 6) * MONTH })),
    ...(s.valueCents && s.fetchedAt ? [{ source: "RentCast", cents: s.valueCents, at: Date.parse(s.fetchedAt), keep: 45 * DAY }] : []),
    ...(s.history ?? [])
      .filter((e) => e.source !== "RentCast")
      .map((e) => ({ source: e.source, cents: e.cents, at: Date.parse(`${e.on}T00:00:00Z`), keep: (yearlySource(e.source) ? 15 : 6) * MONTH })),
  ];
  const newest = new Map<string, (typeof entries)[number]>();
  for (const e of entries) {
    const k = e.source.toLowerCase();
    const had = newest.get(k);
    if (!had || e.at > had.at) newest.set(k, e);
  }
  const all = [...newest.values()];
  if (!all.length) return { cents: null, used: [] };
  const current = all.filter((e) => now - e.at <= e.keep);
  if (current.length) return { cents: Math.round(current.reduce((t, e) => t + e.cents, 0) / current.length), used: current.map((e) => e.source) };
  const last = all.reduce((a, b) => (b.at > a.at ? b : a));
  return { cents: last.cents, used: [last.source] };
}

interface Stored {
  address: string;
  keyEnc: string | null;
  valueCents: number | null;
  lowCents: number | null;
  highCents: number | null;
  fetchedAt: string | null;
  error: string | null;
  /** When a lookup was last tried (a failed one doesn't hold off the next try for a day). */
  triedAt?: string | null;
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
  /** YYYY-MM-DD it was entered, or the 1st of the month (or of January) for a past value. */
  on: string;
  /** A past value known only by year (a county notice): shown as the year. */
  yearOnly?: boolean;
}

/** What a lookup asked for by hand did, in words for the page. */
export type LookupOutcome = { kind: "found"; cents: number } | { kind: "skipped"; why: string } | { kind: "failed"; why: string };

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
export async function saveHomeValueSetup(address: string, apiKey: string | null): Promise<{ view: HomeValueView | null; outcome: LookupOutcome }> {
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
  return lookUpHomeValue(true);
}

/** Looks the value up when it's a month old (or now, when forced but not twice in a day). */
export async function refreshHomeValue(force = false): Promise<HomeValueView | null> {
  return (await lookUpHomeValue(force)).view;
}

/** The same, saying what happened: found, skipped (and why) or failed (and why). */
export async function lookUpHomeValue(force = false): Promise<{ view: HomeValueView | null; outcome: LookupOutcome }> {
  const skip = async (why: string) => ({ view: await homeValue(), outcome: { kind: "skipped", why } as LookupOutcome });
  const s = await load();
  if (!s) return { view: null, outcome: { kind: "skipped", why: "Nothing saved yet" } };
  // Estimates age out on their own, so the Home value is re-blended on every run (no lookup).
  await applyBlend(s);
  if (!s.address) return skip("Add the address first");
  if (!s.keyEnc && !envKey()) return skip("No RentCast key saved");
  const age = s.fetchedAt ? Date.now() - Date.parse(s.fetchedAt) : Infinity;
  if (age < (force ? DAY : 30 * DAY)) return skip(force ? "Already looked up today; try again tomorrow" : "Looked up this month");
  const month = new Date().toISOString().slice(0, 7);
  const used = s.calls?.month === month ? s.calls.count : 0;
  if (used >= MAX_PER_MONTH) return skip(`All ${MAX_PER_MONTH} lookups for this month are used`);
  let key = envKey();
  if (!key) {
    const secret = configuredKey();
    if (!secret) return skip("BANK_SYNC_KEY isn't set on the server, so the saved key can't be opened");
    if (!s.keyEnc) return skip("No RentCast key saved");
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
    const next = { ...s, triedAt: fetchedAt, valueCents, lowCents: json.priceRangeLow ? Math.round(json.priceRangeLow * 100) : null, highCents: json.priceRangeHigh ? Math.round(json.priceRangeHigh * 100) : null, fetchedAt, error: null, history: [...(s.history ?? []), { source: "RentCast", cents: valueCents, on: fetchedAt.slice(0, 10) }].slice(-200) };
    await store(next);
    await applyBlend(next);
    return { view: await homeValue(), outcome: { kind: "found", cents: valueCents } };
  } catch (error) {
    // The last good value and its date stay; only the try is noted.
    const why = error instanceof Error ? error.message : "Lookup failed";
    await store({ ...s, triedAt: new Date().toISOString(), error: why });
    return { view: await homeValue(), outcome: { kind: "failed", why } };
  }
}

/** Adds a value from the past (a county notice from last year): month optional. */
export async function addPastHomeValue(source: string, cents: number, year: number, month: number | null): Promise<HomeValueView> {
  const src = source.trim().slice(0, 40);
  const thisYear = new Date().getUTCFullYear();
  const issues: Record<string, string[]> = {};
  if (!src) issues.source = ["Name where it's from"];
  if (!Number.isFinite(cents) || cents <= 0 || cents >= 1e12) issues.cents = ["Enter the value"];
  if (!Number.isInteger(year) || year < 1990 || year > thisYear) issues.year = [`A year from 1990 to ${thisYear}`];
  if (month !== null && (!Number.isInteger(month) || month < 1 || month > 12)) issues.month = ["Pick a month"];
  if (Object.keys(issues).length) throw new ValidationError(issues);
  const on = `${year}-${String(month ?? 1).padStart(2, "0")}-01`;
  if (on > new Date().toISOString().slice(0, 10)) throw new ValidationError({ month: ["That month hasn't come yet"] });
  const s = (await load()) ?? { address: "", keyEnc: null, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null };
  const entry: HomeEstimate = { source: src, cents: Math.round(cents), on, ...(month ? {} : { yearOnly: true }) };
  s.history = [...(s.history ?? []), entry].sort((a, b) => a.on.localeCompare(b.on)).slice(-200);
  await store(s);
  await applyBlend(s);
  return (await homeValue())!;
}

/** Removes one value from the history (one typed in by mistake), matched exactly. */
export async function removeHomeHistory(item: HomeEstimate): Promise<HomeValueView | null> {
  const s = await load();
  if (!s) return null;
  const i = (s.history ?? []).findIndex((h) => h.source === item.source && h.cents === item.cents && h.on === item.on);
  if (i >= 0) {
    s.history!.splice(i, 1);
    await store(s);
    await applyBlend(s);
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

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
const HOMES_KEY = "homes";
/** The first home: its record keeps the original key, and holds the saved RentCast key and the month's lookup count for all homes. */
const PRIMARY = "home";
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
  /** When a lookup was last tried, found or not. */
  triedAt: string | null;
  /** When the next lookup happens on its own (YYYY-MM-DD), or null when none is set up. */
  nextLookupOn: string | null;
  /** Which home this is, and every home (for the switcher). */
  id: string;
  name: string;
  homes: HomeRef[];
}

/** The history with every current estimate in it (ones saved before the history was kept were missing). */
function fullHistory(s: Stored): HomeEstimate[] {
  const list = [...(s.history ?? [])];
  const has = (e: HomeEstimate) => list.some((h) => h.source.toLowerCase() === e.source.toLowerCase() && h.cents === e.cents && h.on === e.on);
  for (const e of s.estimates ?? []) if (!has(e)) list.push(e);
  if (s.valueCents && s.fetchedAt) {
    const r = { source: "RentCast", cents: s.valueCents, on: s.fetchedAt.slice(0, 10) };
    if (!has(r)) list.push(r);
  }
  return list.sort((a, b) => a.on.localeCompare(b.on));
}

/** The automatic lookup runs once a value is 30 days old (checked hourly), within the month's limit. */
function nextLookup(s: Stored): string | null {
  if (!s.address || (!s.keyEnc && !envKey())) return null;
  const now = Date.now();
  let next = s.valueCents && s.fetchedAt ? Date.parse(s.fetchedAt) + 30 * DAY : now;
  const month = new Date(now).toISOString().slice(0, 7);
  if ((s.calls?.month === month ? s.calls.count : 0) >= MAX_PER_MONTH) {
    const d = new Date(now);
    next = Math.max(next, Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  }
  return new Date(Math.max(next, now)).toISOString().slice(0, 10);
}

/** Each home's record: the first (id "home") keeps the original key, others get their own. */
const keyOf = (id: string) => (id === PRIMARY ? KEY : `${KEY}:${id}`);

async function load(id: string = PRIMARY): Promise<Stored | null> {
  const row = (await prisma.setting.findUnique({ where: { key: keyOf(id) } })) as { value: unknown } | null;
  return row?.value && typeof row.value === "object" ? (row.value as Stored) : null;
}
async function store(v: Stored, id: string = PRIMARY) {
  await prisma.setting.upsert({ where: { key: keyOf(id) }, create: { key: keyOf(id), value: v as never }, update: { value: v as never } });
}

export async function homeValue(id: string = PRIMARY): Promise<HomeValueView | null> {
  const [own, primary, homes] = await Promise.all([load(id), id === PRIMARY ? null : load(PRIMARY), listHomes()]);
  const home = homes.find((h) => h.id === id) ?? { id, name: "Home" };
  const base = await homeView(own, primary ?? own);
  return base ? { ...base, id, name: home.name, homes } : { ...emptyView(), id, name: home.name, homes };
}

/** A home's view; the RentCast key and the month's count come from the first home. */
async function homeView(s: Stored | null, primary: Stored | null): Promise<Omit<HomeValueView, "id" | "name" | "homes"> | null> {
  const estimates = s?.estimates ?? [];
  const averageCents = estimates.length ? Math.round(estimates.reduce((t, e) => t + e.cents, 0) / estimates.length) : null;
  const month = new Date().toISOString().slice(0, 7);
  const calls = primary?.calls?.month === month ? primary.calls.count : 0;
  const keyEnc = s?.keyEnc ?? primary?.keyEnc ?? null;
  const b = s ? blend(s) : { cents: null, used: [] };
  if (!s) return envKey() || keyEnc ? { ...emptyView(), keySaved: !!keyEnc, callsThisMonth: calls, hasKey: true } : null;
  return { keyFromEnv: !!envKey(), keySaved: !!keyEnc, callsThisMonth: calls, callsLimit: MAX_PER_MONTH, estimates, averageCents, usedCents: b.cents, usedSources: b.used, history: fullHistory(s), address: s.address, hasKey: !!keyEnc || !!envKey(), valueCents: s.valueCents, lowCents: s.lowCents, highCents: s.highCents, fetchedAt: s.valueCents ? s.fetchedAt : null, error: s.error, triedAt: s.triedAt ?? null, nextLookupOn: nextLookup({ ...s, keyEnc, calls: primary?.calls }) };
}

function emptyView(): Omit<HomeValueView, "id" | "name" | "homes"> {
  return { keyFromEnv: !!envKey(), keySaved: false, callsThisMonth: 0, callsLimit: MAX_PER_MONTH, estimates: [], averageCents: null, usedCents: null, usedSources: [], history: [], address: "", hasKey: !!envKey(), valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null, triedAt: null, nextLookupOn: null };
}

export interface HomeRef {
  id: string;
  name: string;
}

/** The homes, in order; the first is always there. */
export async function listHomes(): Promise<HomeRef[]> {
  const row = (await prisma.setting.findUnique({ where: { key: HOMES_KEY } })) as { value: unknown } | null;
  const list = Array.isArray(row?.value) ? (row!.value as HomeRef[]).filter((h) => h && typeof h.id === "string" && typeof h.name === "string") : [];
  return list.some((h) => h.id === PRIMARY) ? list : [{ id: PRIMARY, name: "Home" }, ...list];
}

async function saveHomes(list: HomeRef[]) {
  await prisma.setting.upsert({ where: { key: HOMES_KEY }, create: { key: HOMES_KEY, value: list as never }, update: { value: list as never } });
}

/** Adds a home (another property): its own address, estimates and history. */
export async function addHome(name: string): Promise<HomeRef> {
  const clean = name.trim().slice(0, 40) || "Home";
  const homes = await listHomes();
  if (homes.length >= 10) throw new ValidationError({ name: ["Up to 10 homes"] });
  const home = { id: `home-${Date.now().toString(36)}`, name: clean };
  await saveHomes([...homes, home]);
  return home;
}

/** Renames a home; its net worth line follows. */
export async function renameHome(id: string, name: string): Promise<void> {
  const clean = name.trim().slice(0, 40);
  if (!clean) throw new ValidationError({ name: ["Name it"] });
  const homes = await listHomes();
  if (!homes.some((h) => h.id === id)) throw new ValidationError({ id: ["Unknown home"] });
  await saveHomes(homes.map((h) => (h.id === id ? { ...h, name: clean } : h)));
  const assets = await ownedAssets();
  const i = assetIndex(assets, id);
  if (i >= 0) {
    assets[i] = { ...assets[i], name: clean };
    await saveOwnedAssets(assets);
  }
}

/** Removes a home (sold): its record and its net worth line. The first home can't be removed, only renamed. */
export async function removeHome(id: string): Promise<void> {
  if (id === PRIMARY) throw new ValidationError({ id: ["The first home can be renamed, not removed"] });
  await saveHomes((await listHomes()).filter((h) => h.id !== id));
  await prisma.setting.deleteMany({ where: { key: keyOf(id) } });
  const assets = await ownedAssets();
  const i = assetIndex(assets, id);
  if (i >= 0) {
    assets.splice(i, 1);
    await saveOwnedAssets(assets);
  }
}

/** A home's line among the owned assets (the first home's may predate ids: matched by name). */
function assetIndex(assets: Array<{ id: string; name: string }>, id: string): number {
  const byId = assets.findIndex((x) => x.id === id);
  return byId >= 0 || id !== PRIMARY ? byId : assets.findIndex((x) => /^(home|house)\b/i.test(x.name));
}

/** Saves the address and (when given) a new API key, then looks the value up. */
export async function saveHomeValueSetup(address: string, apiKey: string | null, id: string = PRIMARY): Promise<{ view: HomeValueView | null; outcome: LookupOutcome }> {
  const a = address.trim();
  if (a.length < 8 || a.length > 200) throw new ValidationError({ address: ["Enter the full address: street, city, state and ZIP"] });
  const old = await load(id);
  const primary = id === PRIMARY ? old : await load(PRIMARY);
  let keyEnc = old?.keyEnc ?? primary?.keyEnc ?? null;
  if (apiKey && apiKey.trim() && !envKey()) {
    const secret = configuredKey();
    if (!secret) throw new MissingKeyError();
    keyEnc = seal(apiKey.trim(), secret, PURPOSE);
  }
  if (!keyEnc && !envKey()) throw new ValidationError({ apiKey: ["Paste your RentCast API key, or set RENTCAST_API_KEY on the server"] });
  const sameAddress = old?.address === a;
  await store({ ...(old ?? {}), address: a, keyEnc, valueCents: sameAddress ? (old?.valueCents ?? null) : null, lowCents: sameAddress ? (old?.lowCents ?? null) : null, highCents: sameAddress ? (old?.highCents ?? null) : null, fetchedAt: sameAddress ? (old?.fetchedAt ?? null) : null, error: null, estimates: old?.estimates ?? [] }, id);
  return lookUpHomeValue(true);
}

/** Looks the value up when it's a month old (or now, when forced but not twice in a day). */
export async function refreshHomeValue(force = false): Promise<HomeValueView | null> {
  // Every home, each on its own schedule (the month's lookup limit is shared).
  let first: HomeValueView | null = null;
  for (const h of await listHomes()) {
    const v = (await lookUpHomeValue(force, h.id)).view;
    first ??= v;
  }
  return first;
}

/** The same, saying what happened: found, skipped (and why) or failed (and why). */
export async function lookUpHomeValue(force = false, id: string = PRIMARY): Promise<{ view: HomeValueView | null; outcome: LookupOutcome }> {
  const skip = async (why: string) => ({ view: await homeValue(id), outcome: { kind: "skipped", why } as LookupOutcome });
  const s = await load(id);
  if (!s) return { view: null, outcome: { kind: "skipped", why: "Nothing saved yet" } };
  // Estimates age out on their own, so the Home value is re-blended on every run (no lookup).
  await applyBlend(s, id);
  if (!s.address) return skip("Add the address first");
  const primary = id === PRIMARY ? s : await load(PRIMARY);
  const keyEnc = s.keyEnc ?? primary?.keyEnc ?? null;
  if (!keyEnc && !envKey()) return skip("No RentCast key saved");
  // Only a lookup that found a value holds off the next one (an older version stamped failures too).
  const age = s.fetchedAt && s.valueCents ? Date.now() - Date.parse(s.fetchedAt) : Infinity;
  if (age < (force ? DAY : 30 * DAY)) return skip(force ? "Already looked up today; try again tomorrow" : "Looked up this month");
  const month = new Date().toISOString().slice(0, 7);
  const used = primary?.calls?.month === month ? primary.calls.count : 0;
  if (used >= MAX_PER_MONTH) return skip(`All ${MAX_PER_MONTH} lookups for this month are used`);
  let key = envKey();
  if (!key) {
    const secret = configuredKey();
    if (!secret) return skip("BANK_SYNC_KEY isn't set on the server, so the saved key can't be opened");
    if (!keyEnc) return skip("No RentCast key saved");
    key = open(keyEnc, secret, PURPOSE);
  }
  // Counted (on the first home, for all of them) before asking, so a failed lookup still counts.
  if (id === PRIMARY) {
    s.calls = { month, count: used + 1 };
    await store(s, id);
  } else if (primary) {
    await store({ ...primary, calls: { month, count: used + 1 } }, PRIMARY);
  } else {
    await store({ address: "", keyEnc: null, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null, calls: { month, count: used + 1 } }, PRIMARY);
  }
  try {
    const json = (await rentcastGet("/v1/avm/value", { address: s.address }, key)) as { price?: number; priceRangeLow?: number; priceRangeHigh?: number };
    if (typeof json.price !== "number" || json.price <= 0) throw new BankFeedError("RentCast has no estimate for that address");
    const valueCents = Math.round(json.price * 100);
    const fetchedAt = new Date().toISOString();
    const next = { ...s, triedAt: fetchedAt, valueCents, lowCents: json.priceRangeLow ? Math.round(json.priceRangeLow * 100) : null, highCents: json.priceRangeHigh ? Math.round(json.priceRangeHigh * 100) : null, fetchedAt, error: null, history: [...(s.history ?? []), { source: "RentCast", cents: valueCents, on: fetchedAt.slice(0, 10) }].slice(-200) };
    await store(next, id);
    await applyBlend(next, id);
    return { view: await homeValue(id), outcome: { kind: "found", cents: valueCents } };
  } catch (error) {
    // The last good value and its date stay; only the try is noted.
    const why = error instanceof Error ? error.message : "Lookup failed";
    await store({ ...s, triedAt: new Date().toISOString(), error: why }, id);
    return { view: await homeValue(id), outcome: { kind: "failed", why } };
  }
}

/** Adds a value from the past (a county notice from last year): month optional. */
export async function addPastHomeValue(source: string, cents: number, year: number, month: number | null, id: string = PRIMARY): Promise<HomeValueView> {
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
  const s = (await load(id)) ?? { address: "", keyEnc: null, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null };
  const entry: HomeEstimate = { source: src, cents: Math.round(cents), on, ...(month ? {} : { yearOnly: true }) };
  s.history = [...(s.history ?? []), entry].sort((a, b) => a.on.localeCompare(b.on)).slice(-200);
  await store(s, id);
  await applyBlend(s, id);
  return (await homeValue(id))!;
}

/** Removes one value from the history (one typed in by mistake), matched exactly. */
export async function removeHomeHistory(item: HomeEstimate, id: string = PRIMARY): Promise<HomeValueView | null> {
  const s = await load(id);
  if (!s) return null;
  const same = (h: HomeEstimate) => h.source === item.source && h.cents === item.cents && h.on === item.on;
  const i = (s.history ?? []).findIndex(same);
  // A value still in the list above goes from there too, or it would come straight back.
  const j = (s.estimates ?? []).findIndex(same);
  if (i >= 0) s.history!.splice(i, 1);
  if (j >= 0) s.estimates!.splice(j, 1);
  if (i >= 0 || j >= 0) {
    await store(s, id);
    await applyBlend(s, id);
  }
  return homeValue(id);
}

async function setHomeAsset(cents: number, id: string) {
  const assets = await ownedAssets();
  const name = (await listHomes()).find((h) => h.id === id)?.name ?? "Home";
  const i = assetIndex(assets, id);
  if (i >= 0 && assets[i].cents === cents) return;
  if (i >= 0) assets[i] = { ...assets[i], cents };
  else assets.push({ id, name, cents });
  await saveOwnedAssets(assets);
}

async function applyBlend(s: Stored, id: string = PRIMARY) {
  const b = blend(s);
  if (b.cents !== null) await setHomeAsset(b.cents, id);
}

/** Forgets the API key saved in Setup (one in the server's environment stays). */
export async function clearHomeKey(): Promise<void> {
  for (const h of await listHomes()) {
    const s = await load(h.id);
    if (s?.keyEnc) await store({ ...s, keyEnc: null }, h.id);
  }
}

/** Saves the estimates typed in; their average becomes the Home value. */
export async function saveHomeEstimates(list: Array<{ source: string; cents: number }>, address?: string, id: string = PRIMARY): Promise<HomeValueView> {
  const clean = list
    .map((e) => ({ source: e.source.trim().slice(0, 40), cents: Math.round(e.cents) }))
    .filter((e) => e.source && Number.isFinite(e.cents) && e.cents > 0 && e.cents < 1e12);
  if (clean.length > 8) throw new ValidationError({ estimates: ["Up to 8 estimates"] });
  const old = await load(id);
  const before = new Map((old?.estimates ?? []).map((e) => [e.source.toLowerCase(), e]));
  const today = new Date().toISOString().slice(0, 10);
  // A source whose amount didn't change keeps the date it was entered.
  const estimates = clean.map((e) => {
    const had = before.get(e.source.toLowerCase());
    return { ...e, on: had && had.cents === e.cents ? had.on : today };
  });
  await store({ ...(old ?? { keyEnc: null, valueCents: null, lowCents: null, highCents: null, fetchedAt: null, error: null }), address: address?.trim().slice(0, 200) || old?.address || "", estimates }, id);
  // Values that are new or changed go into the history with today's date.
  const changed = estimates.filter((e) => {
    const had = before.get(e.source.toLowerCase());
    return !had || had.cents !== e.cents;
  });
  const saved = await load(id);
  if (saved) {
    saved.history = [...(saved.history ?? []), ...changed].slice(-200);
    await store(saved, id);
    await applyBlend(saved, id);
  }
  return (await homeValue(id))!;
}

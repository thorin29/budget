/**
 * The Amazon extension's health, for the alerts (Review, the phone) and its row in Settings › Data
 * Imports & Exports. Only once an Amazon-scoped device has been added: then a sync that didn't
 * go well, or none in three days, shows until the next good one.
 */

import { prisma } from "@/lib/prisma";

const STALE_DAYS = 3;

export interface AmazonSyncState {
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastStatus: string | null;
  failedSection: string | null;
  extensionVersion: string | null;
  chargesSplit: number;
  ordersWaiting: number;
}

export interface AmazonAlert {
  /** Stable while the problem lasts, new once it changes. */
  key: string;
  title: string;
  body: string;
}

type Row = { lastRunAt: Date | null; lastSuccessAt: Date | null; lastStatus: string | null; failedSection: string | null; extensionVersion: string | null; chargesSplit: number; ordersWaiting: number };

/** The extension's last sync, or null before it has ever reported. */
export async function amazonSyncState(): Promise<AmazonSyncState | null> {
  const row = (await prisma.amazonSync.findUnique({ where: { id: "default" } })) as Row | null;
  if (!row) return null;
  return {
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastSuccessAt: row.lastSuccessAt?.toISOString() ?? null,
    lastStatus: row.lastStatus,
    failedSection: row.failedSection,
    extensionVersion: row.extensionVersion,
    chargesSplit: row.chargesSplit,
    ordersWaiting: row.ordersWaiting,
  };
}

export async function amazonAlert(now = new Date()): Promise<AmazonAlert | null> {
  const device = (await prisma.device.findFirst({
    where: { scope: "amazon", revokedAt: null, expiresAt: { gt: now } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  })) as { createdAt: Date } | null;
  if (!device) return null;
  const row = (await prisma.amazonSync.findUnique({ where: { id: "default" } })) as Row | null;
  const day = now.toISOString().slice(0, 10);
  const status = row?.lastStatus ?? null;
  if (status === "amazon_signed_out" || status === "captcha") {
    return { key: `amazonSync:${status}:${row?.lastRunAt?.toISOString().slice(0, 10) ?? day}`, title: "Amazon sync paused", body: status === "captcha" ? "Open Amazon to finish its check" : "Sign in to Amazon" };
  }
  if (status === "parse_failed") {
    return { key: `amazonSync:parse:${row?.lastRunAt?.toISOString().slice(0, 10) ?? day}`, title: "Amazon changed its pages", body: row?.failedSection && /^[a-z0-9_]{1,40}$/.test(row.failedSection) ? `Update the extension · ${row.failedSection.replace(/_/g, " ")}` : "Update the extension" };
  }
  if (status === "ledger_error") {
    return { key: `amazonSync:ledger:${row?.lastRunAt?.toISOString().slice(0, 10) ?? day}`, title: "Amazon sync failed", body: "Ledger couldn't save it" };
  }
  const since = row?.lastSuccessAt ?? device.createdAt;
  if (now.getTime() - since.getTime() > STALE_DAYS * 86_400_000) {
    return { key: `amazonSync:stale:${since.toISOString().slice(0, 10)}`, title: `No Amazon sync in ${STALE_DAYS} days`, body: "Open Amazon with the extension on" };
  }
  return null;
}

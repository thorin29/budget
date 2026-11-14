/**
 * Replays for phone writes. The phone queues writes while offline and sends
 * each with an `Idempotency-Key` (a UUID it made when the person pressed
 * Confirm). If the connection drops after the server applied a write but
 * before the phone heard back, the phone sends it again; this returns the
 * first answer instead of applying it twice.
 *
 * A key is scoped to the device that sent it, and to the method and path: the
 * same key on a different request is refused rather than replayed.
 */

import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ValidationError } from "./errors";
import { fail } from "./http";
import type { DeviceAuth } from "./device-auth";

const KEEP_DAYS = 30;
const KEY = /^[A-Za-z0-9_-]{8,64}$/;

let lastPrune = 0;

async function prune(now: number) {
  if (now - lastPrune < 3_600_000) return;
  lastPrune = now;
  await prisma.idempotencyRecord
    .deleteMany({ where: { createdAt: { lt: new Date(now - KEEP_DAYS * 86_400_000) } } })
    .catch(() => undefined);
}

/**
 * Runs `work` once per key. Without a key the write simply runs (the web never
 * sends one; old phone builds may not). Only settled answers are kept: 2xx,
 * 409 and 422. A 5xx or 401 is not, so a retry can still succeed later.
 */
export async function idempotent(
  request: Request,
  auth: DeviceAuth,
  work: () => Promise<NextResponse>,
): Promise<NextResponse> {
  const key = request.headers.get("idempotency-key");
  if (!key) return work();
  if (!KEY.test(key)) throw new ValidationError({ idempotencyKey: ["8 to 64 letters, numbers, dash or underscore"] });

  const url = new URL(request.url);
  const path = url.pathname + url.search;
  const method = request.method.toUpperCase();

  const existing = (await prisma.idempotencyRecord.findUnique({
    where: { deviceId_key: { deviceId: auth.device.id, key } },
  })) as { method: string; path: string; status: number; body: string } | null;

  if (existing) {
    if (existing.method !== method || existing.path !== path) {
      throw new ValidationError({ idempotencyKey: ["Already used for a different request"] });
    }
    return new NextResponse(existing.body, {
      status: existing.status,
      headers: { "Content-Type": "application/json", "Idempotent-Replay": "true" },
    });
  }

  // A refusal (409 changed elsewhere, 422 invalid) is a settled answer too, so
  // turn it into its response here and keep it like a success.
  let response: NextResponse;
  try {
    response = await work();
  } catch (error) {
    response = fail(error);
  }
  const settled = (response.status >= 200 && response.status < 300) || response.status === 409 || response.status === 422;
  if (settled) {
    const body = await response.clone().text();
    await prisma.idempotencyRecord
      .create({ data: { deviceId: auth.device.id, key, method, path, status: response.status, body } })
      // Two copies of one write racing: the first stored answer stands.
      .catch(() => undefined);
  }
  void prune(Date.now());
  return response;
}

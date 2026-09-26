import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { APP_VERSION, BUILD_SHA } from "@/lib/version";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      status: "ok",
      database: "up",
      version: APP_VERSION,
      commit: BUILD_SHA,
    });
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "down", version: APP_VERSION },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { APP_VERSION } from "@/lib/version";

export const dynamic = "force-dynamic";

/**
 * Public by design: the phone app reads it before signing in to check it is
 * talking to a Budget server it understands. Version only.
 */
export async function GET() {
  return NextResponse.json({ app: "budget", version: APP_VERSION, api: 1 });
}

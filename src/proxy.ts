import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce, parseFrameAncestors } from "@/lib/csp";
import { decide, isNavigation, kindOf } from "@/lib/auth/gate";
import { SESSION_COOKIE } from "@/lib/auth/rules";
import { userCount, userFromToken } from "@/server/session";

/**
 * The front door. Runs on every request — hard loads, client navigations and
 * server-action POSTs alike — on the Node runtime, so it reads the database
 * directly. No environment switch turns it off.
 *
 * It decides with the rules in lib/auth/gate.ts and sets the security
 * headers. Server actions additionally check the caller themselves, because a
 * path cannot gate them.
 */

// Once an account exists it stays so (an account can't remove itself), so the
// count is only read until the first one appears.
let hasUsers = false;

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const kind = kindOf(pathname, request.headers);

  if (!hasUsers) hasUsers = (await userCount()) > 0;
  const user = hasUsers ? await userFromToken(request.cookies.get(SESSION_COOKIE)?.value) : null;

  const decision = decide({
    pathname,
    search,
    kind,
    hasUsers,
    signedIn: user !== null,
    navigation: isNavigation(request.headers),
  });

  if (decision.type === "deny") {
    return NextResponse.json(
      { error: { code: "unauthorized", message: "Sign in required" } },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (decision.type === "redirect") {
    return NextResponse.redirect(new URL(decision.to, request.url));
  }

  const nonce = makeNonce();
  const csp = buildCsp({
    nonce,
    dev: process.env.NODE_ENV === "development",
    frameAncestors: parseFrameAncestors(process.env.FRAME_ANCESTORS),
  });

  // Next reads the policy from the request to stamp the nonce on its scripts.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  if (!process.env.FRAME_ANCESTORS) response.headers.set("X-Frame-Options", "SAMEORIGIN");
  return response;
}

export const config = {
  // Static build output and the icons carry no data. Everything else, the API
  // included, passes the gate.
  matcher: ["/((?!_next/static|icon.png|icon-192.png|icon-512.png|robots.txt|manifest.webmanifest).*)"],
};

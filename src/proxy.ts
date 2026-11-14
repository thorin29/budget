import { NextResponse, type NextRequest } from "next/server";
import { buildCsp, makeNonce, parseFrameAncestors } from "@/lib/csp";

/**
 * Runs on every request (hard loads, client navigations and server-action
 * POSTs alike), on the Node runtime. Today it sets the security headers; the
 * sign-in gate joins it in 0.13, so there is one front door, not a check in a
 * layout that a client-side navigation could skip.
 */
export function proxy(request: NextRequest) {
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
  // Static build output carries no HTML, so it needs no policy. Its other
  // headers come from next.config.
  matcher: ["/((?!_next/static|icon.png|icon-192.png|icon-512.png|robots.txt|manifest.webmanifest).*)"],
};

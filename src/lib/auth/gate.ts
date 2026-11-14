/**
 * Who may reach what. Pure, so every rule is unit-tested; the proxy feeds it
 * facts and acts on the answer.
 *
 * Paths gate pages. They cannot gate server actions: an action
 * is chosen by an id in a header, whatever the path it is posted to. That is
 * why every action also calls requireUser() itself.
 */

import { safeNext } from "./safe-next";

export type RequestKind = "page" | "action" | "api";

export type GateDecision =
  | { type: "allow" }
  | { type: "redirect"; to: string }
  | { type: "deny" };

/** Reachable by anyone, signed in or not. */
const PUBLIC = new Set(["/api/health", "/api/v1/meta"]);

const SIGN_IN = "/sign-in";
const SETUP = "/setup-account";
const JOIN = "/join";

export function decide({
  pathname,
  search = "",
  kind,
  hasUsers,
  signedIn,
  navigation = true,
}: {
  pathname: string;
  search?: string;
  kind: RequestKind;
  hasUsers: boolean;
  signedIn: boolean;
  /**
   * A top-level page load or a client-side navigation. Background fetches the
   * browser makes on its own (favicon.ico and the like) are not, and are
   * refused rather than redirected, so they never become a "return to" path.
   */
  navigation?: boolean;
}): GateDecision {
  if (PUBLIC.has(pathname)) return { type: "allow" };

  // The phone API authenticates every request itself with a device token and
  // never reads the browser cookie; see server/device-auth.ts.
  if (pathname === "/api/v1" || pathname.startsWith("/api/v1/")) return { type: "allow" };

  // First run: the only way in is creating the first account.
  if (!hasUsers) {
    if (pathname === SETUP) return { type: "allow" };
    return kind === "page" && navigation ? { type: "redirect", to: SETUP } : { type: "deny" };
  }

  // Once anyone has an account, the setup page is closed for good.
  if (pathname === SETUP) return { type: "redirect", to: signedIn ? "/month" : SIGN_IN };

  if (signedIn) {
    if (kind === "page" && (pathname === SIGN_IN || pathname === JOIN)) {
      return { type: "redirect", to: "/month" };
    }
    return { type: "allow" };
  }

  if (pathname === SIGN_IN || pathname === JOIN) return { type: "allow" };
  if (kind !== "page" || !navigation) return { type: "deny" };

  const back = safeNext(`${pathname}${search}`, "");
  return { type: "redirect", to: back && back !== "/" ? `${SIGN_IN}?next=${encodeURIComponent(back)}` : SIGN_IN };
}

export function kindOf(pathname: string, headers: Headers): RequestKind {
  if (headers.has("next-action")) return "action";
  if (pathname.startsWith("/api/")) return "api";
  return "page";
}

/**
 * Whether the browser is navigating (a page load, or Next's own client-side
 * navigation) rather than fetching something in the background. Browsers send
 * Sec-Fetch-Mode; anything that doesn't (scripts, older clients) is treated
 * as a navigation so it still gets a sign-in page rather than an error.
 */
export function isNavigation(headers: Headers): boolean {
  const mode = headers.get("sec-fetch-mode");
  if (!mode || mode === "navigate") return true;
  return headers.has("rsc") || headers.has("next-router-prefetch");
}

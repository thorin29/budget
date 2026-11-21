import { describe, expect, it } from "vitest";
import { scopeAllows } from "../device-auth";

describe("scopeAllows", () => {
  it("lets a full token go anywhere", () => {
    expect(scopeAllows("full", "/api/v1/transactions")).toBe(true);
  });
  it("keeps an amazon token on its own routes", () => {
    for (const p of ["/api/v1/amazon/orders", "/api/v1/amazon/status", "/api/v1/auth/refresh", "/api/v1/auth/logout", "/api/v1/auth/logout/"]) expect(scopeAllows("amazon", p)).toBe(true);
    for (const p of ["/api/v1/transactions", "/api/v1/auth/me", "/api/v1/amazonx", "/api/v1/settings", "/api/v1/amazon/../settings".replace("/amazon/..", "")]) expect(scopeAllows("amazon", p)).toBe(false);
  });
  it("refuses an unknown scope", () => {
    expect(scopeAllows("other", "/api/v1/amazon/orders")).toBe(false);
  });
});

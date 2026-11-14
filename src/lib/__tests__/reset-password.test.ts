import { describe, expect, it } from "vitest";
import { verifyPassword } from "../auth/password";
// @ts-expect-error — a plain .mjs script with no type declarations.
import { hashPassword, temporaryPassword } from "../../../scripts/reset-password.mjs";

describe("reset-password script", () => {
  it("writes hashes the app accepts", async () => {
    const password = temporaryPassword();
    expect(password).toHaveLength(20);
    expect(await verifyPassword(password, await hashPassword(password))).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { INTEREST_FEE } from "@/server/debt";

describe("card interest and fees", () => {
  it("counts what the card charged", () => {
    for (const d of ["INTEREST CHARGE:PURCHASES", "CAPITAL ONE MEMBER FEE", "PAST DUE FEE", "LATE FEE", "FOREIGN TRANSACTION FEE"]) expect(INTEREST_FEE.test(d)).toBe(true);
  });
  it("leaves out fees paid with the card, and coffee", () => {
    for (const d of ["RYAN YOUNG- HOCKEY FEE", "TYL*SOUTHLAKE FEE", "TEXAS.GOV*SERVICEFEE-R", "SQ *FARMHOUSE COFFEE & TR", "LEAGUE FEES"]) expect(INTEREST_FEE.test(d)).toBe(false);
  });
});

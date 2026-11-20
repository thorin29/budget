import { describe, expect, it } from "vitest";
import { sameNameTags } from "../same-names";

describe("sameNameTags", () => {
  it("tags paychecks by payday and bills by due day", () => {
    const t = sameNameTags([
      { id: "a", name: "Pay", paydayNumber: 1 },
      { id: "b", name: "Pay", paydayNumber: 2 },
      { id: "c", name: "Crypto", dueDay: 1 },
      { id: "d", name: "Crypto", dueDay: 23 },
      { id: "e", name: "Rent", dueDay: 1 },
      { id: "f", name: "Rent", dueDay: 5, active: false },
    ]);
    expect([...t.values()]).toEqual(["Pay · 1st paycheck", "Pay · 2nd paycheck", "Crypto · 1st", "Crypto · 23rd", "Rent", "Rent"]);
  });
});

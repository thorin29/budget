// Every value here is invented.
import { describe, expect, it } from "vitest";
import { filtersEncrypted, isSealed, openDeep, openField, sealArgs, sealField } from "../field-crypto";

const key = "f".repeat(40);

describe("field encryption", () => {
  it("seals and opens, leaving plain values readable", () => {
    const sealed = sealField("SQ *BLUE KETTLE CAFE", key);
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain("KETTLE");
    expect(sealField(sealed, key)).toBe(sealed);
    expect(openField(sealed, key)).toBe("SQ *BLUE KETTLE CAFE");
    expect(openField("plain", key)).toBe("plain");
    expect(openField(sealed, null)).toBe("[encrypted]");
    expect(openField(sealed, "g".repeat(40))).toBe("[unreadable]");
  });

  it("uses a fresh IV, so equal values don't look equal", () => {
    expect(sealField("Checking", key)).not.toBe(sealField("Checking", key));
  });

  it("seals only the listed fields of writes", () => {
    const create = sealArgs("BankTransaction", "create", { data: { description: "ACME", amount: "1.00", merchant: "Acme" } }, key) as {
      data: Record<string, string>;
    };
    expect(isSealed(create.data.description) && isSealed(create.data.merchant)).toBe(true);
    expect(create.data.amount).toBe("1.00");

    const many = sealArgs("BankTransaction", "createMany", { data: [{ description: "A" }, { description: "B" }] }, key) as {
      data: Array<Record<string, string>>;
    };
    expect(many.data.every((d) => isSealed(d.description))).toBe(true);

    const upsert = sealArgs("BankAccount", "upsert", { where: { externalId: "x" }, create: { name: "Everyday" }, update: { name: { set: "Everyday" } } }, key) as {
      create: Record<string, string>;
      update: { name: { set: string } };
      where: Record<string, string>;
    };
    expect(isSealed(upsert.create.name) && isSealed(upsert.update.name.set)).toBe(true);
    expect(upsert.where.externalId).toBe("x");

    expect(sealArgs("Category", "create", { data: { name: "Groceries" } }, key)).toEqual({ data: { name: "Groceries" } });
  });

  it("opens results deeply, keeping dates and decimals intact", () => {
    const when = new Date("2026-01-02T00:00:00Z");
    const decimal = { toFixed: () => "1.00", toString: () => "1.00" };
    const out = openDeep({ merchant: sealField("Acme", key), postedOn: when, amount: decimal, account: { name: sealField("Checking", key) } }, key);
    expect(out.merchant).toBe("Acme");
    expect(out.account.name).toBe("Checking");
    expect(out.postedOn).toBe(when);
    expect(out.amount).toBe(decimal);
  });

  it("refuses database filters on encrypted fields", () => {
    expect(filtersEncrypted("BankTransaction", { merchant: { contains: "x" } })).toBe("merchant");
    expect(filtersEncrypted("BankTransaction", { OR: [{ accountId: "a" }, { description: "x" }] })).toBe("description");
    expect(filtersEncrypted("BankTransaction", { accountId: "a", kind: "NORMAL" })).toBeNull();
    expect(filtersEncrypted("LineItem", { notes: { not: null } })).toBeNull();
  });
});

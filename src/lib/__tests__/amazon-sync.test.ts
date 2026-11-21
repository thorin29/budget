// Invented orders, products, amounts and card digits only.
import { describe, expect, it } from "vitest";
import { itemsPerCharge, last4From, planSync, readOrders, syncFrom, type BankCharge, type SyncOrder } from "../amazon-sync";

const order = (over: Partial<SyncOrder> = {}): SyncOrder => ({
  orderId: "111-0000000-0000001",
  orderDate: "2026-03-01",
  items: [
    { name: "Example Multivitamin, 120 Count", cents: 2000, quantity: 1, shipmentKey: "a", shipDate: "2026-03-02" },
    { name: "Paper Towels, 12 Rolls", cents: 1500, quantity: 2, shipmentKey: "a", shipDate: "2026-03-02" },
  ],
  charges: [{ date: "2026-03-02", cents: 5400, last4: "0000" }],
  ...over,
});
const bank = (id: string, postedOn: string, cents: number, over: Partial<BankCharge> = {}): BankCharge => ({ id, postedOn, cents, last4: null, split: false, ...over });

describe("readOrders", () => {
  it("accepts a good body and drops fields it doesn't know", () => {
    const r = readOrders({ orders: [{ ...order(), shippingAddress: "nope", items: [{ ...order().items[0], seller: "x" }] }] });
    expect("orders" in r).toBe(true);
    if ("orders" in r) expect(Object.keys(r.orders[0].items[0]).sort()).toEqual(["cents", "name", "quantity", "shipDate", "shipmentKey"]);
  });

  it("refuses bad dates, amounts, card digits and oversized batches", () => {
    expect(readOrders({ orders: [order({ orderDate: "March 1" })] })).toHaveProperty("issues");
    expect(readOrders({ orders: [order({ items: [{ name: "X", cents: -5, quantity: 1, shipmentKey: "a", shipDate: null }] })] })).toHaveProperty("issues");
    expect(readOrders({ orders: [order({ charges: [{ date: "2026-03-02", cents: 100, last4: "12345" }] })] })).toHaveProperty("issues");
    expect(readOrders({ orders: Array.from({ length: 51 }, () => order()) })).toHaveProperty("issues");
    expect(readOrders({})).toHaveProperty("issues");
  });
});

describe("planSync", () => {
  it("matches Amazon's own charge and folds quantity into the items", () => {
    const plan = planSync([order()], [bank("t1", "2026-03-03", 5400)], "2026-03-10");
    expect(plan.matched).toBe(1);
    expect(plan.toSplit).toHaveLength(1);
    expect(plan.toSplit[0].items.map((i) => i.cents)).toEqual([2000, 3000]);
  });

  it("allows a cent of rounding and five days, no more", () => {
    expect(planSync([order()], [bank("t1", "2026-03-07", 5401)], "2026-03-10").matched).toBe(1);
    expect(planSync([order()], [bank("t1", "2026-03-08", 5400)], "2026-03-10").matched).toBe(0);
    expect(planSync([order()], [bank("t1", "2026-03-03", 5402)], "2026-03-10").matched).toBe(0);
  });

  it("leaves a card whose name shows other digits alone", () => {
    expect(planSync([order()], [bank("t1", "2026-03-03", 5400, { last4: "9999" })], "2026-03-10").matched).toBe(0);
    expect(planSync([order()], [bank("t1", "2026-03-03", 5400, { last4: "0000" })], "2026-03-10").matched).toBe(1);
  });

  it("counts an already split charge as matched and writes nothing (re-sending is safe)", () => {
    const plan = planSync([order()], [bank("t1", "2026-03-03", 5400, { split: true })], "2026-03-10");
    expect(plan.matched).toBe(1);
    expect(plan.toSplit).toHaveLength(0);
    expect(plan.waiting).toHaveLength(0);
  });

  it("waits for a recent charge, gives up on an old one", () => {
    const recent = planSync([order()], [], "2026-03-10");
    expect(recent.waiting).toEqual(["111-0000000-0000001"]);
    expect(recent.waitingSince).toBe("2026-03-01");
    expect(planSync([order()], [], "2026-04-30").waiting).toHaveLength(0);
  });

  it("uses each bank charge once across orders", () => {
    const two = [order(), order({ orderId: "111-0000000-0000002" })];
    const plan = planSync(two, [bank("t1", "2026-03-03", 5400)], "2026-03-10");
    expect(plan.matched).toBe(1);
    expect(plan.waiting).toEqual(["111-0000000-0000002"]);
  });

  it("falls back to item totals when an order has no charge list", () => {
    const plan = planSync([order({ charges: [] })], [bank("t1", "2026-03-03", 5000)], "2026-03-10");
    expect(plan.toSplit).toHaveLength(1);
  });
});

describe("itemsPerCharge", () => {
  it("gives each charge its own shipment", () => {
    const o = order({
      items: [
        { name: "Kids Rain Jacket", cents: 3000, quantity: 1, shipmentKey: "a", shipDate: "2026-03-02" },
        { name: "Building Bricks Castle Set", cents: 6000, quantity: 1, shipmentKey: "b", shipDate: "2026-03-04" },
      ],
      charges: [
        { date: "2026-03-02", cents: 3248, last4: null },
        { date: "2026-03-04", cents: 6495, last4: null },
      ],
    });
    const per = itemsPerCharge(o);
    expect(per.find((p) => p.charge.cents === 3248)!.items.map((i) => i.name)).toEqual(["Kids Rain Jacket"]);
    expect(per.find((p) => p.charge.cents === 6495)!.items.map((i) => i.name)).toEqual(["Building Bricks Castle Set"]);
  });
});

describe("helpers", () => {
  it("reads last 4 digits only when the name marks them", () => {
    expect(last4From("Rewards Card …1234")).toBe("1234");
    expect(last4From(null, "CREDIT CARD (5678)")).toBe("5678");
    expect(last4From("Card ending in 0000")).toBe("0000");
    expect(last4From("Rewards 2024")).toBeNull();
  });

  it("starts the next sync a week before the newest split, else 90 days back", () => {
    expect(syncFrom("2026-03-10", "2026-04-01")).toBe("2026-03-03");
    expect(syncFrom(null, "2026-04-01")).toBe("2026-01-01");
  });
});

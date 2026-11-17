// Invented orders and products only.
import { describe, expect, it } from "vitest";
import { itemKind, matchCharges, parseOrderHistory, shipments, slimOrderHistory, splitByKind } from "../amazon-orders";

const header = 'ASIN,"Carrier Name & Tracking Number",Department,"Order Date","Order ID","Order Status","Product Name","Ship Date","Total Amount"';
const row = (order: string, date: string, name: string, dept: string, total: string, ship = date, track = "TBA1", status = "Closed") =>
  `X,"${track}",${dept},${date}T10:00:00Z,${order},${status},"${name}",${ship}T12:00:00Z,${total}`;

describe("Amazon order history", () => {
  const text = [
    header,
    row("111-1", "2026-03-01", "Example Multivitamin, 120 Count", "Health and Beauty", "20.00"),
    row("111-1", "2026-03-01", "Paper Towels, 12 Rolls", "Grocery", "15.50"),
    row("111-1", "2026-03-01", "Kids Rain Jacket", "Apparel", "34.50", "2026-03-03", "TBA2"),
    row("222-2", "2026-03-05", "Building Bricks Castle Set", "Toy", "60.00"),
    row("333-3", "2026-03-06", "Something Cancelled", "Toy", "9.99", "2026-03-06", "TBA3", "Cancelled"),
  ].join("\n");

  it("reads items, skips cancelled ones, and groups shipments", () => {
    const items = parseOrderHistory(text);
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.kind)).toEqual(["health", "household", "clothing", "toys"]);
    const s = shipments(items);
    expect(s.map((x) => x.cents).sort((a, b) => a - b)).toEqual([3450, 3550, 6000]);
  });

  it("sorts items by name first, then department", () => {
    expect(itemKind("Organic Peanut Butter, 16 oz", "Grocery")).toBe("groceries");
    expect(itemKind("Large Breed Dog Food, 30 lb", "Grocery")).toBe("pets");
    expect(itemKind("Unlocked Android Smartphone, 128GB", "Office Product")).toBe("electronics");
    expect(itemKind("Backpacking Pack 50L", "Sports")).toBe("outdoors");
    expect(itemKind("Hockey Tape, 3 Pack", "Sports")).toBe("sports");
    expect(itemKind("Spiral Notebook, College Ruled", "Office Product")).toBe("school");
    expect(itemKind("Mystery Widget", "Misc.")).toBe("other");
  });

  it("matches shipments, then whole orders, to charges of the same amount", () => {
    const s = shipments(parseOrderHistory(text));
    const m = matchCharges(s, [
      { id: "a", postedOn: "2026-03-02", cents: 3550 },
      { id: "b", postedOn: "2026-03-04", cents: 3450 },
      { id: "c", postedOn: "2026-03-07", cents: 6000 },
      { id: "d", postedOn: "2026-03-07", cents: 6000 },
    ]);
    expect(m.map((x) => x.chargeId).sort()).toEqual(["a", "b", "c"]);
    const whole = matchCharges(s.filter((x) => x.orderId === "111-1"), [{ id: "e", postedOn: "2026-03-03", cents: 7000 }]);
    expect(whole).toHaveLength(1);
    expect(whole[0].items).toHaveLength(3);
  });

  it("splits a charge by kind so the parts add up exactly", () => {
    const items = parseOrderHistory(text).filter((i) => i.orderId === "111-1");
    const parts = splitByKind(7001, items);
    expect(parts.reduce((t, p) => t + p.cents, 0)).toBe(7001);
    expect(parts.find((p) => p.kind === "clothing")!.names).toEqual(["Kids Rain Jacket"]);
  });

  it("keeps only the columns it reads, and reads the slim file the same", () => {
    const withAddress = text.replace(header, `${header},"Shipping Address"`).split("\n").map((l, i) => (i ? `${l},"1 Example Way, Anytown"` : l)).join("\n");
    const slim = slimOrderHistory(withAddress);
    expect(slim).not.toContain("Anytown");
    expect(parseOrderHistory(slim)).toEqual(parseOrderHistory(text));
  });

  it("refuses a file that isn't the order history", () => {
    expect(() => parseOrderHistory("Date,Amount\n2026-01-01,5")).toThrow();
  });
});

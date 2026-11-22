import { describe, expect, it } from "vitest";
import { itemKind, kindFromCategory, splitByItem, type OrderItem } from "../amazon-orders";

describe("kindFromCategory", () => {
  it("reads Amazon's category path", () => {
    expect(kindFromCategory("Grocery & Gourmet Food › Produce › Fresh Vegetables")).toBe("groceries");
    expect(kindFromCategory("Health & Household › Vitamins, Minerals & Supplements")).toBe("health");
    expect(kindFromCategory("Health & Household › Household Supplies › Paper Towels")).toBe("household");
    expect(kindFromCategory("Clothing, Shoes & Jewelry › Boys › Jackets")).toBe("clothing");
    expect(kindFromCategory("Pet Supplies › Fish & Aquatic Pets › Food")).toBe("aquarium");
    expect(kindFromCategory("Sports & Outdoors › Team Sports › Hockey")).toBe("sports");
    expect(kindFromCategory("Something New")).toBeNull();
    expect(kindFromCategory(null)).toBeNull();
  });
});

describe("itemKind by name", () => {
  it("knows common food without a department", () => {
    expect(itemKind("Sweet Potatoes (Orange Flesh), 3 lb")).toBe("groceries");
    expect(itemKind("Mini Marshmallows, 10 oz Bag")).toBe("groceries");
    expect(itemKind("Shaved Brussels Sprouts, 12 oz")).toBe("groceries");
  });
  it("keeps non-food matches ahead of food words", () => {
    expect(itemKind("Refrigerator water filter")).toBe("household");
    expect(itemKind("Grain-free dog food, 24 lb")).toBe("pets");
  });
});

describe("splitByItem", () => {
  const item = (name: string, cents: number): OrderItem => ({ orderId: "1", orderDate: "2026-01-02", shipDate: null, shipmentKey: "1", name, department: "", cents, kind: "other" });
  it("shares the charge by price and adds up exactly", () => {
    const parts = splitByItem(1000, [item("A", 333), item("B", 333), item("C", 334)]);
    expect(parts.map((p) => p.item.name)).toEqual(["A", "B", "C"]);
    expect(parts.reduce((s, p) => s + p.cents, 0)).toBe(1000);
  });
});

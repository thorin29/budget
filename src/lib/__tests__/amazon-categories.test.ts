import { describe, expect, it } from "vitest";
import { isAmazonCharge, itemKind, kindFromCategory, splitByItem, type OrderItem } from "../amazon-orders";

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

describe("more names", () => {
  it("places common Amazon items", () => {
    expect(itemKind("Amazon Basics Thick Maxi Pads with Wings for Periods")).toBe("personal");
    expect(itemKind("Seachem Flourish Iron 500ml")).toBe("aquarium");
    expect(itemKind("Hikari Tropical Sinking Wafers for Catfish")).toBe("aquarium");
    expect(itemKind("Xbox Wireless Headset")).toBe("electronics");
    expect(itemKind("CORSAIR VENGEANCE LPX DDR4 RAM 64GB")).toBe("electronics");
    expect(itemKind("Wonder Powdered Mini Donuts, 10 oz Bag")).toBe("groceries");
    expect(itemKind("Drum Happy Birthday Cake Topper")).toBe("gifts");
  });
});

describe("isAmazonCharge", () => {
  it("takes orders, not digital", () => {
    expect(isAmazonCharge({ merchant: "Amazon", description: "AMZN Mktp US*AB12" })).toBe(true);
    expect(isAmazonCharge({ merchant: "Whole Foods", description: "WHOLEFDS MKT" })).toBe(true);
    expect(isAmazonCharge({ merchant: "Amazon Prime", description: "Prime membership" })).toBe(false);
    expect(isAmazonCharge({ merchant: "Grocer", description: "GROCER 12" })).toBe(false);
  });
});

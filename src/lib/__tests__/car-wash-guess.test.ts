import { describe, expect, it } from "vitest";
import { guessFor } from "../category-guess";

describe("car wash and parking guesses", () => {
  it("a car wash called an auto spa is a car wash, not personal care", () => {
    expect(guessFor("Carnation Auto Spa HWY", "", -1100, true)?.name).toBe("Car wash");
    expect(guessFor("Sally Beauty", "", -389, true)?.name).not.toBe("Car wash");
  });
  it("tolls and parking get their own category", () => {
    expect(guessFor("NTTA tolls", "NTTA AUTOCHARGE", -1590, true)?.name).toBe("Parking & tolls");
    expect(guessFor("Ace Parking", "", -2000, true)?.name).toBe("Parking & tolls");
  });
});

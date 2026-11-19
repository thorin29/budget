import { describe, expect, it } from "vitest";
import { shade } from "./parts";

describe("shade", () => {
  it("keeps a lone budget at the tier color", () => expect(shade("red", 0, 1)).toBe("red"));
  it("goes from darker to lighter, staying the tier's color", () => {
    expect(shade("red", 0, 2)).toContain("black");
    expect(shade("red", 1, 2)).toContain("white");
    expect(shade("red", 2, 5)).toBe("red");
    expect(shade("red", 4, 5)).toBe("color-mix(in oklab, red, white 40%)");
  });
});

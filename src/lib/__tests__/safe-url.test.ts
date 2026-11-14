import { describe, expect, it } from "vitest";
import { safeHttpUrl } from "../safe-url";

describe("safeHttpUrl", () => {
  it("keeps http and https links", () => {
    expect(safeHttpUrl("https://example.com/pay")).toBe("https://example.com/pay");
    expect(safeHttpUrl("  http://example.com ")).toBe("http://example.com/");
  });

  it("refuses script and data schemes, whatever the casing", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<b>x</b>")).toBeNull();
    expect(safeHttpUrl("vbscript:msgbox")).toBeNull();
  });

  it("refuses smuggled control characters and whitespace", () => {
    expect(safeHttpUrl("java\tscript:alert(1)")).toBeNull();
    expect(safeHttpUrl("https://exa mple.com")).toBeNull();
    expect(safeHttpUrl("https://example.com/\u0000")).toBeNull();
  });

  it("refuses relative paths, empty values and junk", () => {
    expect(safeHttpUrl("/month")).toBeNull();
    expect(safeHttpUrl("//example.com")).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl(`https://example.com/${"a".repeat(2100)}`)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { barcodeSvg, guessFormat, imageKind } from "../loyalty";

describe("loyalty cards", () => {
  it("guesses the barcode type from the number", () => {
    expect(guessFormat("036000291452")).toBe("UPC_A");
    expect(guessFormat("041220000123")).toBe("CODE_128");
    expect(guessFormat("4006381333931")).toBe("EAN_13");
    expect(guessFormat("96385074")).toBe("EAN_8");
    expect(guessFormat("RW-0042-77")).toBe("CODE_128");
  });

  it("only takes JPEG, PNG or WebP images", () => {
    expect(imageKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(imageKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(imageKind(new Uint8Array([0x47, 0x49, 0x46, 0x38]))).toBeNull();
  });

  it("draws a barcode, and says when a number can't be drawn", async () => {
    expect(await barcodeSvg("41872009355521", "CODE_128")).toMatch(/^<svg/);
    expect(await barcodeSvg("not digits", "EAN_13")).toBeNull();
  });
});

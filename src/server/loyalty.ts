/**
 * Store loyalty cards the household shares: a name, the card's number and barcode type, and a look
 * (a color, or an image uploaded for it). The phone shows the barcode at the register; the web
 * shows and edits them too. Images are kept in the database, never in the repo.
 */

import { prisma } from "@/lib/prisma";
import { NotFoundError, ValidationError } from "./errors";

/** Barcode types, as ZXing names them (the phone draws and scans with these names). */
export const FORMATS = ["CODE_128", "CODE_39", "CODE_93", "CODABAR", "EAN_13", "EAN_8", "UPC_A", "UPC_E", "ITF", "QR_CODE", "PDF_417", "AZTEC", "DATA_MATRIX"] as const;
export type Format = (typeof FORMATS)[number];

export const FORMAT_LABELS: Record<Format, string> = {
  CODE_128: "Code 128 (most stores)",
  CODE_39: "Code 39",
  CODE_93: "Code 93",
  CODABAR: "Codabar",
  EAN_13: "EAN-13",
  EAN_8: "EAN-8",
  UPC_A: "UPC-A",
  UPC_E: "UPC-E",
  ITF: "ITF",
  QR_CODE: "QR code",
  PDF_417: "PDF417",
  AZTEC: "Aztec",
  DATA_MATRIX: "Data Matrix",
};

const MAX_IMAGE = 2_000_000;

export interface LoyaltyCardView {
  id: string;
  name: string;
  number: string;
  format: Format;
  color: string;
  memberName: string | null;
  /** 0 when there's no image; goes up with each new one. */
  imageVersion: number;
  useCount: number;
  lastUsedAt: string | null;
}

/** The barcode type a typed number most likely is: UPC-A for 12 digits, EAN for 13 or 8, else Code 128. */
export function guessFormat(number: string): Format {
  const n = number.replace(/\s/g, "");
  if (/^\d{12}$/.test(n) && checkDigitOk(n)) return "UPC_A";
  if (/^\d{13}$/.test(n) && checkDigitOk(n)) return "EAN_13";
  if (/^\d{8}$/.test(n) && checkDigitOk(n)) return "EAN_8";
  return "CODE_128";
}

/** UPC and EAN numbers end in a check digit; a number that fails it isn't one of those. */
function checkDigitOk(n: string): boolean {
  const d = n.split("").map(Number);
  const check = d.pop()!;
  const sum = d.reverse().reduce((t, x, i) => t + x * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

const select = { id: true, name: true, number: true, format: true, color: true, memberName: true, imageVersion: true, image: false, useCount: true, lastUsedAt: true } as const;

function view(r: { id: string; name: string; number: string; format: string; color: string; memberName: string | null; imageVersion: number; useCount: number; lastUsedAt: Date | null }): LoyaltyCardView {
  return { ...r, format: (FORMATS as readonly string[]).includes(r.format) ? (r.format as Format) : "CODE_128", lastUsedAt: r.lastUsedAt?.toISOString() ?? null };
}

/** Every card, most used first. */
export async function listCards(): Promise<LoyaltyCardView[]> {
  const rows = (await prisma.loyaltyCard.findMany({ select })) as Parameters<typeof view>[0][];
  return rows.map(view).sort((a, b) => b.useCount - a.useCount || a.name.localeCompare(b.name));
}

function clean(input: Record<string, unknown>) {
  const name = String(input.name ?? "").trim().slice(0, 40);
  const number = String(input.number ?? "").trim().slice(0, 200);
  const format = String(input.format ?? "") || guessFormat(number);
  const color = String(input.color ?? "#334155");
  const memberName = String(input.memberName ?? "").trim().slice(0, 40) || null;
  const issues: Record<string, string[]> = {};
  if (!name) issues.name = ["Enter the store"];
  if (!number) issues.number = ["Enter the card number"];
  if (!(FORMATS as readonly string[]).includes(format)) issues.format = ["Pick a barcode type"];
  if (!/^#[0-9a-fA-F]{6}$/.test(color)) issues.color = ["Pick a color"];
  if (format === "UPC_A" && !/^\d{11,12}$/.test(number)) issues.number = ["A UPC-A number is 12 digits"];
  if (format === "EAN_13" && !/^\d{12,13}$/.test(number)) issues.number = ["An EAN-13 number is 13 digits"];
  if (format === "EAN_8" && !/^\d{7,8}$/.test(number)) issues.number = ["An EAN-8 number is 8 digits"];
  if (Object.keys(issues).length) throw new ValidationError(issues);
  return { name, number, format, color, memberName };
}

export async function addCard(input: Record<string, unknown>): Promise<LoyaltyCardView> {
  return view((await prisma.loyaltyCard.create({ data: clean(input), select })) as Parameters<typeof view>[0]);
}

export async function updateCard(id: string, input: Record<string, unknown>): Promise<LoyaltyCardView> {
  if (!(await prisma.loyaltyCard.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundError("Card");
  return view((await prisma.loyaltyCard.update({ where: { id }, data: clean(input), select })) as Parameters<typeof view>[0]);
}

export async function deleteCard(id: string): Promise<void> {
  await prisma.loyaltyCard.deleteMany({ where: { id } });
}

/** Counts a use, so the cards used most come first. */
export async function markUsed(id: string): Promise<void> {
  await prisma.loyaltyCard.updateMany({ where: { id }, data: { useCount: { increment: 1 }, lastUsedAt: new Date() } });
}

/** What kind of image the bytes are, by their first bytes; null when not JPEG, PNG or WebP. */
export function imageKind(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** Sets the card's image (null removes it). JPEG, PNG or WebP, up to 2 MB. */
export async function setImage(id: string, bytes: Uint8Array | null): Promise<LoyaltyCardView> {
  if (!(await prisma.loyaltyCard.findUnique({ where: { id }, select: { id: true } }))) throw new NotFoundError("Card");
  let type: string | null = null;
  if (bytes) {
    if (bytes.length > MAX_IMAGE) throw new ValidationError({ image: ["That image is over 2 MB"] });
    type = imageKind(bytes);
    if (!type) throw new ValidationError({ image: ["Use a JPEG, PNG or WebP image"] });
  }
  const r = await prisma.loyaltyCard.update({
    where: { id },
    data: bytes ? { image: Buffer.from(bytes), imageType: type, imageVersion: { increment: 1 } } : { image: null, imageType: null, imageVersion: 0 },
    select,
  });
  return view(r as Parameters<typeof view>[0]);
}

export async function cardImage(id: string): Promise<{ bytes: Uint8Array; type: string } | null> {
  // Read directly: the field-encryption layer walks model results and doesn't keep raw bytes intact.
  const rows = (await prisma.$queryRaw`SELECT "image", "imageType" FROM "LoyaltyCard" WHERE "id" = ${id}`) as Array<{ image: Uint8Array | null; imageType: string | null }>;
  const r = rows[0];
  return r?.image && r.imageType ? { bytes: new Uint8Array(r.image), type: r.imageType } : null;
}

/** The card's barcode as SVG, for the web. Null when the number can't be drawn in that type. */
export async function barcodeSvg(number: string, format: Format): Promise<string | null> {
  const { toSVG } = await import("bwip-js/node");
  const bcid: Record<Format, string> = {
    CODE_128: "code128", CODE_39: "code39", CODE_93: "code93", CODABAR: "rationalizedCodabar", EAN_13: "ean13", EAN_8: "ean8",
    UPC_A: "upca", UPC_E: "upce", ITF: "interleaved2of5", QR_CODE: "qrcode", PDF_417: "pdf417", AZTEC: "azteccode", DATA_MATRIX: "datamatrix",
  };
  const twoD = ["QR_CODE", "AZTEC", "DATA_MATRIX"].includes(format);
  try {
    return toSVG({ bcid: bcid[format], text: number, scale: 3, ...(twoD ? {} : { height: 22 }), includetext: false, paddingwidth: 8, paddingheight: 8, backgroundcolor: "ffffff" });
  } catch {
    return null;
  }
}

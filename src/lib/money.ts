/**
 * Money is integer cents everywhere inside the application.
 *
 *   PostgreSQL   Decimal(12,2)
 *   domain       integer cents  (this module)
 *   UI           formatted dollars
 *
 * JavaScript's number type cannot represent most decimal fractions exactly, so
 * accumulating dollars with + and - drifts. This application's entire output is
 * a single figure the user acts on, which makes that unacceptable.
 *
 * Every field carrying money is named with a `Cents` suffix. If a value is not
 * named that way, it is not money.
 */

export type Cents = number;

const CENTS_PER_DOLLAR = 100;

/** Guard against a fractional value being passed off as cents. */
function assertWhole(value: number, label: string): void {
  if (!Number.isFinite(value) || !Number.isInteger(value)) {
    throw new Error(`${label} must be an integer number of cents, received ${value}`);
  }
}

/**
 * Convert a Prisma Decimal — or anything that stringifies to a fixed decimal —
 * into cents, without ever routing the value through a float.
 */
export function toCents(value: { toString(): string } | string | number): Cents {
  const text = typeof value === "number" ? value.toFixed(2) : String(value);
  const match = /^(-)?(\d+)(?:\.(\d{1,}))?$/.exec(text.trim());

  if (!match) {
    throw new Error(`Cannot read a monetary value from "${text}"`);
  }

  const [, sign, whole, fraction = ""] = match;
  const padded = (fraction + "00").slice(0, 2);
  const rest = fraction.slice(2);

  let cents = Number(whole) * CENTS_PER_DOLLAR + Number(padded);

  // Round half away from zero on anything beyond two decimal places.
  if (rest && Number(rest[0]) >= 5) cents += 1;

  return sign === "-" ? -cents : cents;
}

/** Cents back to a fixed decimal string, for writing to a Decimal column. */
export function toDecimalString(cents: Cents): string {
  assertWhole(cents, "amount");
  const negative = cents < 0;
  const absolute = Math.abs(cents);
  const whole = Math.floor(absolute / CENTS_PER_DOLLAR);
  const fraction = String(absolute % CENTS_PER_DOLLAR).padStart(2, "0");
  return `${negative ? "-" : ""}${whole}.${fraction}`;
}

/** Display form, e.g. 123456 -> "$1,234.56". */
export function formatCents(
  cents: Cents,
  options: { currency?: string; locale?: string; signed?: boolean } = {},
): string {
  assertWhole(cents, "amount");
  const { currency = "USD", locale = "en-US", signed = false } = options;

  const formatted = new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    signDisplay: signed ? "exceptZero" : "auto",
  }).format(cents / CENTS_PER_DOLLAR);

  return formatted;
}

/** Parse user input — "1,234.56", "$1234.56", "1234" — into cents. */
export function parseCents(input: string): Cents {
  const cleaned = input.replace(/[\s,$]/g, "");
  if (cleaned === "" || cleaned === "-") throw new Error("No amount given");
  return toCents(cleaned);
}

export function sumCents(values: Iterable<Cents>): Cents {
  let total = 0;
  for (const value of values) {
    assertWhole(value, "amount");
    total += value;
  }
  return total;
}

// Every merchant, account and amount here is invented.
import { describe, expect, it } from "vitest";
import { cleanMerchant } from "../merchant";
import { isVerificationNoise, pairTransfers } from "../transfers";
import { matchDuplicates } from "../bank-match";
import { csvField, parseBankCsv, parseCents, parseDate, splitCsv, toCsv } from "../bank-csv";
import { BankFeedError, allowedHosts, checkUrl, decodeSetupToken, parseAccounts } from "../simplefin";
import { configuredKey, open, seal } from "../secret-box";
import { isDue } from "../bank-schedule";

describe("cleanMerchant", () => {
  it("strips processor prefixes, store numbers and order ids", () => {
    expect(cleanMerchant("SQ *BLUE KETTLE CAFE")).toBe("Blue Kettle Cafe");
    expect(cleanMerchant("TST* RIVERSIDE GRILL 0042")).toBe("Riverside Grill");
    expect(cleanMerchant("ACME MARKET #1234 SPRINGFIELD")).toBe("Acme Market");
    expect(cleanMerchant("WIDGETMART MKTPL*AB12CD34E")).toBe("Widgetmart Mktpl");
    expect(cleanMerchant("SAMPLE FUEL 00123456 ANYTOWN XX")).toBe("Sample Fuel");
  });

  it("groups variants of one merchant", () => {
    const names = ["ACME MARKET #0101", "ACME MARKET #2202 OTHERVILLE", "ACME MARKET 3303"].map((d) => cleanMerchant(d));
    expect(new Set(names).size).toBe(1);
  });

  it("drops a trailing state code", () => {
    expect(cleanMerchant("PINE STREET BAKERY          CENTERVILLE TX")).toBe("Pine Street Bakery");
    expect(cleanMerchant("PINE STREET BAKERY TX")).toBe("Pine Street Bakery");
  });

  it("prefers the payee the feed provides", () => {
    expect(cleanMerchant("POS DEBIT 1234 XYZ", "Example Hardware")).toBe("Example Hardware");
  });

  it("never returns empty", () => {
    expect(cleanMerchant("#1234")).not.toBe("");
  });
});

describe("pairTransfers", () => {
  const row = (id: string, accountId: string, postedOn: string, amountCents: number, description = "Transfer") => ({
    id,
    accountId,
    postedOn,
    amountCents,
    description,
  });

  it("pairs opposite amounts across accounts within the window", () => {
    const pairs = pairTransfers([
      row("a", "checking", "2026-03-01", -50_000, "Card payment"),
      row("b", "card", "2026-03-03", 50_000, "Payment thank you"),
      row("c", "checking", "2026-03-02", -1_299, "Coffee"),
    ]);
    expect(pairs).toEqual([["a", "b"]]);
  });

  it("ignores the same account and gaps beyond the window", () => {
    expect(pairTransfers([row("a", "x", "2026-03-01", -100), row("b", "x", "2026-03-01", 100)])).toEqual([]);
    expect(pairTransfers([row("a", "x", "2026-03-01", -100), row("b", "y", "2026-03-20", 100)])).toEqual([]);
  });

  it("pairs each row once, closest date first", () => {
    const pairs = pairTransfers([
      row("out1", "x", "2026-03-01", -2_000),
      row("out2", "x", "2026-03-05", -2_000),
      row("in1", "y", "2026-03-05", 2_000),
      row("in2", "y", "2026-03-02", 2_000),
    ]);
    expect(pairs.sort()).toEqual([
      ["out1", "in2"],
      ["out2", "in1"],
    ]);
  });

  it("spots account verification cents", () => {
    expect(isVerificationNoise({ amountCents: 24, description: "EXAMPLE BANK ACCTVERIFY" })).toBe(true);
    expect(isVerificationNoise({ amountCents: -29, description: "Account verification" })).toBe(true);
    expect(isVerificationNoise({ amountCents: 2_400, description: "ACCTVERIFY" })).toBe(false);
    expect(isVerificationNoise({ amountCents: 24, description: "Interest" })).toBe(false);
  });
});

describe("matchDuplicates", () => {
  it("matches on amount within three days, one to one", () => {
    const existing = [
      { postedOn: "2026-02-10", amountCents: -500, merchant: "Corner Coffee" },
      { postedOn: "2026-02-12", amountCents: -500, merchant: "Corner Coffee" },
    ];
    const incoming = [
      { postedOn: "2026-02-09", amountCents: -500 },
      { postedOn: "2026-02-11", amountCents: -500 },
      { postedOn: "2026-02-11", amountCents: -500 },
      { postedOn: "2026-02-20", amountCents: -500 },
    ];
    const result = matchDuplicates(existing, incoming);
    expect(result.filter((r) => r !== -1)).toHaveLength(2);
    expect(result[3]).toBe(-1);
  });
});

describe("bank CSV", () => {
  it("splits quoted fields", () => {
    expect(splitCsv('a,"b, c","d ""e"""\r\n1,2,3\n')).toEqual([
      ["a", "b, c", 'd "e"'],
      ["1", "2", "3"],
    ]);
  });

  it("reads amounts and dates", () => {
    expect(parseCents("$1,234.56")).toBe(123_456);
    expect(parseCents("(12.00)")).toBe(-1_200);
    expect(parseCents("-7.5")).toBe(-750);
    expect(parseCents("")).toBeNull();
    expect(parseDate("11/3/26")).toBe("2026-11-03");
    expect(parseDate("2026-02-30")).toBeNull();
  });

  it("reads a signed amount layout", () => {
    const csv = "Transaction Date,Post Date,Description,Category,Type,Amount\n11/02/2026,11/03/2026,WIDGETMART*AB12CD,Shopping,Sale,-24.99\n11/04/2026,11/05/2026,WIDGETMART,Shopping,Return,10.00\n";
    const { rows, layout } = parseBankCsv(csv);
    expect(layout).toBe("signed amount");
    expect(rows).toEqual([
      { postedOn: "2026-11-02", amountCents: -2_499, description: "WIDGETMART*AB12CD" },
      { postedOn: "2026-11-04", amountCents: 1_000, description: "WIDGETMART" },
    ]);
  });

  it("reads debit and credit columns", () => {
    const csv = "Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit\n2026-10-01,2026-10-02,0000,ACME MARKET,Groceries,45.10,\n2026-10-05,2026-10-05,0000,AUTOPAY PAYMENT,Payment,,300.00\n";
    const { rows } = parseBankCsv(csv);
    expect(rows.map((r) => r.amountCents)).toEqual([-4_510, 30_000]);
  });

  it("reads an amount with a credit/debit indicator", () => {
    const csv = "Posting Date,Transaction Date,Amount,Credit Debit Indicator,type,Description\n09/02/2026,09/01/2026,80.00,Debit,Debit,Example Utility\n09/03/2026,09/03/2026,1000.00,Credit,Credit,Payroll Deposit\n";
    const { rows, layout } = parseBankCsv(csv);
    expect(layout).toBe("amount with credit/debit column");
    expect(rows).toEqual([
      { postedOn: "2026-09-01", amountCents: -8_000, description: "Example Utility" },
      { postedOn: "2026-09-03", amountCents: 100_000, description: "Payroll Deposit" },
    ]);
  });

  it("writes CSV safely", () => {
    expect(csvField('Say "hi", ok')).toBe('"Say ""hi"", ok"');
    expect(csvField("=SUM(A1)")).toBe("'=SUM(A1)");
    expect(csvField(-12.5)).toBe("-12.5");
    expect(csvField("-12.00")).toBe("-12.00");
    expect(csvField("-cmd")).toBe("'-cmd");
    expect(toCsv(["a", "b"], [[1, null]])).toBe("a,b\r\n1,\r\n");
  });

  it("skips a title block above the header and can flip signs", () => {
    const csv = "Account summary\nSomething,else\nDate,Description,Amount\n2026-01-05,Example Store,12.00\n";
    expect(parseBankCsv(csv, { flipSigns: true }).rows[0].amountCents).toBe(-1_200);
  });
});

describe("SimpleFIN", () => {
  const hosts = allowedHosts({});
  const token = (url: string) => Buffer.from(url).toString("base64");

  it("decodes a setup token to an allowed claim URL", () => {
    expect(decodeSetupToken(token("https://beta-bridge.simplefin.org/simplefin/claim/abc123"), hosts).pathname).toBe(
      "/simplefin/claim/abc123",
    );
  });

  it("refuses other hosts, plain http and smuggled credentials", () => {
    expect(() => decodeSetupToken(token("https://evil.example/claim/x"), hosts)).toThrow(BankFeedError);
    expect(() => decodeSetupToken(token("http://bridge.simplefin.org/claim/x"), hosts)).toThrow(BankFeedError);
    expect(() => decodeSetupToken(token("https://u:p@bridge.simplefin.org/claim/x"), hosts)).toThrow(BankFeedError);
    expect(() => decodeSetupToken("not a token!", hosts)).toThrow(BankFeedError);
  });

  it("requires credentials on an access URL", () => {
    expect(checkUrl("https://u:p@bridge.simplefin.org/simplefin", hosts, { credentials: true }).username).toBe("u");
    expect(() => checkUrl("https://bridge.simplefin.org/simplefin", hosts, { credentials: true })).toThrow(BankFeedError);
  });

  it("adds hosts from the environment", () => {
    expect(allowedHosts({ SIMPLEFIN_EXTRA_HOSTS: "feed.example.com, bad host" })).toContain("feed.example.com");
  });

  it("reads the accounts document", () => {
    const doc = parseAccounts(
      {
        errors: ["A connection needs attention"],
        accounts: [
          {
            org: { name: "Example Credit Union", domain: "example.org" },
            id: "ACT-1",
            name: "Everyday Checking",
            currency: "USD",
            balance: "1520.33",
            "available-balance": "1500.00",
            "balance-date": 1_794_800_000,
            transactions: [
              { id: "T1", posted: 1_794_700_000, amount: "-42.10", description: "SQ *BLUE KETTLE CAFE", payee: "", memo: "" },
              { id: "T2", posted: 0, transacted_at: 1_794_790_000, amount: "-9.99", description: "Pending thing", pending: true },
            ],
          },
        ],
      },
      "UTC",
    );
    expect(doc.messages).toEqual(["A connection needs attention"]);
    const a = doc.accounts[0];
    expect(a.institution).toBe("Example Credit Union");
    expect(a.transactions[0]).toMatchObject({ externalId: "T1", amount: "-42.10", payee: null, pending: false });
    expect(a.transactions[1].pending).toBe(true);
    expect(a.transactions[1].postedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("rejects a malformed document", () => {
    expect(() => parseAccounts({ accounts: [{ id: "x", balance: "lots" }] })).toThrow(BankFeedError);
  });
});

describe("secret box", () => {
  const key = "k".repeat(40);
  it("round-trips and detects tampering or a different key", () => {
    const sealed = seal("https://u:p@bridge.simplefin.org/simplefin", key);
    expect(sealed).not.toContain("simplefin");
    expect(open(sealed, key)).toBe("https://u:p@bridge.simplefin.org/simplefin");
    expect(() => open(sealed, "z".repeat(40))).toThrow();
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("A") ? "BB" : "AA");
    expect(() => open(parts.join("."), key)).toThrow();
  });

  it("requires a long enough key", () => {
    expect(configuredKey({ BANK_SYNC_KEY: "short" })).toBeNull();
    expect(configuredKey({ BANK_SYNC_KEY: key })).toBe(key);
  });
});

describe("daily schedule", () => {
  const at = (s: string) => new Date(s);
  it("runs once after the hour, with retries spaced out", () => {
    process.env.TZ = "UTC";
    expect(isDue(at("2026-11-16T05:00:00Z"), null, null, 6)).toBe(false);
    expect(isDue(at("2026-11-16T06:10:00Z"), null, null, 6)).toBe(true);
    expect(isDue(at("2026-11-16T09:00:00Z"), at("2026-11-16T06:10:00Z"), at("2026-11-16T06:10:00Z"), 6)).toBe(false);
    expect(isDue(at("2026-11-16T07:00:00Z"), at("2026-11-15T06:10:00Z"), at("2026-11-16T06:10:00Z"), 6)).toBe(false);
    expect(isDue(at("2026-11-16T10:00:00Z"), at("2026-11-15T06:10:00Z"), at("2026-11-16T06:10:00Z"), 6)).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { buildYearGrid, yearGridCsv, type YearItem } from "../year";

const item = (over: Partial<YearItem>): YearItem => ({
  id: "x",
  name: "Item",
  kind: "BILL",
  dueDay: 5,
  periodAssignment: "AUTO",
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  scheduleKind: "MONTHLY",
  onlyYear: null,
  startYear: null,
  startMonth: null,
  endYear: null,
  endMonth: null,
  active: true,
  plannedCents: 10000,
  categoryName: "Home",
  paidFromSurplus: false,
  ...over,
});

const now = { year: 2030, month: 3 };

describe("buildYearGrid", () => {
  it("budgets scheduled months and records actuals beside them", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [item({ id: "a" })],
      plans: new Map(),
      actuals: new Map([["a:1", 9000], ["a:2", 11000]]),
      now,
    });
    const [row] = grid.rows;
    expect(row.cells[0]).toMatchObject({ budgetedCents: 10000, actualCents: 9000, over: false, future: false });
    expect(row.cells[1]).toMatchObject({ actualCents: 11000, over: true });
    expect(row.cells[3].future).toBe(true);
    expect(grid.billsPaidCents).toBe(20000);
    expect(grid.billsBudgetedCents).toBe(120000);
  });

  it("uses overrides, leaves skipped and unscheduled months empty", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [item({ id: "q", months: [1, 4, 7, 10], scheduleKind: "QUARTERLY" })],
      plans: new Map([
        ["q:4", { amountCents: 2500, skipped: false }],
        ["q:7", { amountCents: null, skipped: true }],
      ]),
      actuals: new Map(),
      now,
    });
    const cells = grid.rows[0].cells;
    expect(cells[0].budgetedCents).toBe(10000);
    expect(cells[1].budgetedCents).toBeNull();
    expect(cells[3].budgetedCents).toBe(2500);
    expect(cells[6].budgetedCents).toBeNull();
  });

  it("shows a retired item only where it was paid", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [item({ id: "r", active: false })],
      plans: new Map(),
      actuals: new Map([["r:2", 10000]]),
      now,
    });
    const cells = grid.rows[0].cells;
    expect(cells.filter((c) => c.budgetedCents !== null)).toHaveLength(1);
    expect(cells[1].budgetedCents).toBe(10000);
  });

  it("drops items with nothing in the year", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [item({ id: "o", scheduleKind: "ONE_OFF", onlyYear: 2029, months: [5] })],
      plans: new Map(),
      actuals: new Map(),
      now,
    });
    expect(grid.rows).toHaveLength(0);
  });

  it("splits income, bills and what is paid from the leftover", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [
        item({ id: "pay", name: "Pay", kind: "INCOME", plannedCents: 300000, categoryName: null }),
        item({ id: "bill", name: "Rent" }),
        item({ id: "card", name: "Card", paidFromSurplus: true, categoryName: "Cards" }),
      ],
      plans: new Map(),
      actuals: new Map([
        ["pay:1", 300000],
        ["bill:1", 10000],
        ["card:1", 50000],
      ]),
      now,
    });
    expect(grid.rows.map((r) => r.name)).toEqual(["Pay", "Rent", "Card"]);
    expect(grid.incomeReceivedCents).toBe(300000);
    expect(grid.billsPaidCents).toBe(10000);
    expect(grid.surplusPaidCents).toBe(50000);
    expect(grid.leftOverCents).toBe(240000);
    expect(grid.categories).toEqual([
      { name: "Cards", paidCents: 50000 },
      { name: "Home", paidCents: 10000 },
    ]);
  });
});

describe("yearGridCsv", () => {
  it("quotes, neutralises formulas and writes amounts as dollars", () => {
    const grid = buildYearGrid({
      year: 2030,
      items: [item({ id: "a", name: '=Odd, "name"' })],
      plans: new Map(),
      actuals: new Map([["a:1", 9050]]),
      now,
    });
    const [header, line] = yearGridCsv(grid).trim().split("\r\n");
    expect(header.startsWith("Item,Kind,Category,Jan budget,Jan paid")).toBe(true);
    expect(line.startsWith(`"'=Odd, ""name""",Bill,Home,100.00,90.50,100.00,`)).toBe(true);
  });
});

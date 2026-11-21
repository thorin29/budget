/**
 * A changes file: a list of corrections to existing data (rename or merge categories, set a bill's
 * category, recategorize transactions, tie a loan account to its bill…), checked first and then
 * applied in order (bills by id, or by name when only one bill has it). For bringing history from somewhere else into shape in one go instead of
 * clicking through each fix. Things are named by id (as the audit file shows them); categories and
 * budgets can also be named by name, so a file can create one and use it in the same run.
 *
 * {"kind": "budget-changes", "version": 1, "ops": [{"op": "renameCategory", "category": "Dining", "name": "Restaurants"}, …]}
 */

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { merchantKey } from "@/lib/field-crypto";
import { ValidationError } from "./errors";
import { SETTING_KEYS } from "@/lib/settings";
import { sameNameTags } from "@/lib/same-names";
import { accountLabels } from "./bank/ledger";

const id = z.string().min(1).max(64);
const ids = z.array(id).min(1).max(5000);
const ref = z.string().min(1).max(80); // a category or budget: its id or its name
const cents = z.number().int().min(0).max(100_000_000);

const Op = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("renameAccount"),
    accountId: id,
    name: z.string().min(1).max(60),
  }),
  z.object({
    op: z.literal("setNickname"),
    bankAccountId: id,
    nickname: z.string().max(60).nullable(),
  }),
  z.object({ op: z.literal("mergeAccount"), fromId: id, intoId: id }),
  z.object({
    op: z.literal("createCategory"),
    name: z.string().min(1).max(60),
    group: ref.optional(),
  }),
  z.object({
    op: z.literal("renameCategory"),
    category: ref,
    name: z.string().min(1).max(60),
  }),
  z.object({ op: z.literal("mergeCategory"), from: ref, into: ref }),
  z.object({ op: z.literal("deleteCategory"), category: ref }),
  z.object({
    op: z.literal("moveCategory"),
    category: ref,
    group: ref.nullable(),
  }),
  z.object({
    op: z.literal("setGroupLimit"),
    group: ref,
    limitCents: cents.nullable(),
  }),
  z.object({
    op: z.literal("renameGroup"),
    group: ref,
    name: z.string().min(1).max(60),
  }),
  z.object({ op: z.literal("deleteGroup"), group: ref }),
  z.object({
    op: z.literal("setBill"),
    lineItemId: id,
    name: z.string().min(1).max(80).optional(),
    category: ref.nullable().optional(),
    kind: z.enum(["BILL", "INCOME", "SETTLEMENT"]).optional(),
    active: z.boolean().optional(),
    startYear: z.number().int().min(1990).max(2100).nullable().optional(),
    startMonth: z.number().int().min(1).max(12).nullable().optional(),
    endYear: z.number().int().min(1990).max(2100).nullable().optional(),
    endMonth: z.number().int().min(1).max(12).nullable().optional(),
    paidFromId: id.nullable().optional(),
    chargedToId: id.nullable().optional(),
    /** Every month ("MONTHLY") or some months ("CUSTOM" with `months`). A paycheck tied to a payday shows only in months with that payday. */
    scheduleKind: z.enum(["MONTHLY", "CUSTOM"]).optional(),
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
  }),
  z.object({ op: z.literal("mergeBill"), fromId: id, intoId: id }),
  z.object({ op: z.literal("linkLoan"), lineItemId: id, bankAccountId: id }),
  z.object({
    op: z.literal("linkPaycheck"),
    lineItemId: id,
    scheduleId: id.nullable(),
  }),
  /** A new usual amount from a month on (the months before keep the old one); from the next unpaid month when left out. */
  z.object({
    op: z.literal("setAmount"),
    lineItemId: id,
    cents: z.number().int().min(1).max(10_000_000_00),
    from: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  /** A bill whose amount moves every month (water, power): only its typical payment is checked. */
  z.object({ op: z.literal("setTarget"), lineItemId: id, on: z.boolean() }),
  /** A new bill, paycheck or card payment. `months` makes it some months only; `paysCard` is a card's bank account id. */
  z.object({
    op: z.literal("addBill"),
    name: z.string().min(1).max(80),
    kind: z.enum(["BILL", "INCOME", "SETTLEMENT"]),
    cents: z.number().int().min(0).max(10_000_000_00),
    dueDay: z.number().int().min(1).max(31),
    months: z.array(z.number().int().min(1).max(12)).min(1).max(12).optional(),
    category: ref.optional(),
    paysCard: id.optional(),
    /** YYYY-MM: the first month it's due. */
    from: z
      .string()
      .regex(/^\d{4}-\d{2}$/)
      .optional(),
  }),
  z.object({
    op: z.literal("categorize"),
    transactionIds: ids,
    category: ref.nullable(),
  }),
  z.object({ op: z.literal("markTransfer"), transactionIds: ids }),
  z.object({ op: z.literal("unlinkPayment"), actualIds: ids }),
  z.object({
    op: z.literal("addBillRule"),
    lineItemId: id,
    merchant: z.string().min(1).max(200),
    coversAll: z.boolean().optional(),
  }),
  z.object({
    op: z.literal("removeBillRule"),
    lineItemId: id,
    merchantKey: z.string().min(1).max(200),
  }),
  z.object({
    op: z.literal("addCategoryRule"),
    merchant: z.string().min(1).max(200),
    category: ref,
  }),
  /** Asks the person to pick: the step shows a list of the options (or every category). */
  z.object({
    op: z.literal("choose"),
    transactionId: id,
    label: z.string().max(200),
    options: z.array(ref).max(20).optional(),
  }),
]);
export type ChangeOp = z.infer<typeof Op>;

const File = z.object({
  kind: z.literal("budget-changes"),
  version: z.literal(1),
  note: z.string().max(500).optional(),
  ops: z.array(Op).min(1).max(2000),
});

export interface ChangeStep {
  n: number;
  text: string;
  /** Why it can't be applied (it's skipped). */
  problem: string | null;
  /** A "choose" step: the transaction and the categories to pick from. */
  choice: {
    transactionId: string;
    options: Array<{ id: string; name: string }>;
  } | null;
}

export function parseChanges(text: string): z.infer<typeof File> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ValidationError({ file: ["That isn't a JSON file"] });
  }
  const parsed = File.safeParse(raw);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ValidationError({
      file: [`Not a changes file: ${issue.path.join(".")} ${issue.message}`],
    });
  }
  return parsed.data;
}

/**
 * Bills can be named instead of given by id (handy for a bill an import just made): a value that
 * isn't an id and matches exactly one bill's name becomes that bill's id.
 */
async function resolveBills(
  file: z.infer<typeof File>,
): Promise<z.infer<typeof File>> {
  const items = (await prisma.lineItem.findMany({
    select: { id: true, name: true },
  })) as Array<{ id: string; name: string }>;
  const ids = new Set(items.map((i) => i.id));
  const byName = new Map<string, string[]>();
  for (const i of items)
    byName.set(i.name, [...(byName.get(i.name) ?? []), i.id]);
  const fix = (v: string) =>
    ids.has(v) ? v : byName.get(v)?.length === 1 ? byName.get(v)![0] : v;
  const ops = file.ops.map((op) => {
    if (op.op === "mergeBill")
      return { ...op, fromId: fix(op.fromId), intoId: fix(op.intoId) };
    if ("lineItemId" in op) return { ...op, lineItemId: fix(op.lineItemId) };
    return op;
  });
  return { ...file, ops };
}

/** What the names and ids in the file point at, as the steps run (a created category counts from then on). */
class World {
  categories = new Map<string, { id: string; name: string }>(); // by id
  groups = new Map<string, { id: string; name: string }>();
  async load() {
    const [cats, groups] = (await Promise.all([
      prisma.category.findMany({ select: { id: true, name: true } }),
      prisma.categoryGroup.findMany({ select: { id: true, name: true } }),
    ])) as [
      Array<{ id: string; name: string }>,
      Array<{ id: string; name: string }>,
    ];
    this.categories = new Map(cats.map((c) => [c.id, c]));
    this.groups = new Map(groups.map((g) => [g.id, g]));
    return this;
  }
  category(r: string) {
    return (
      this.categories.get(r) ??
      [...this.categories.values()].find(
        (c) => c.name.toLowerCase() === r.toLowerCase(),
      ) ??
      null
    );
  }
  group(r: string) {
    return (
      this.groups.get(r) ??
      [...this.groups.values()].find(
        (g) => g.name.toLowerCase() === r.toLowerCase(),
      ) ??
      null
    );
  }
}

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Describes each step and checks it can be done, without changing anything. */
export async function previewChanges(
  text: string,
): Promise<{ note: string | null; steps: ChangeStep[] }> {
  const file = await resolveBills(parseChanges(text));
  const world = await new World().load();
  const [items, accounts, banks, schedules] = (await Promise.all([
    prisma.lineItem.findMany({
      select: {
        id: true,
        name: true,
        dueDay: true,
        paydayNumber: true,
        active: true,
      },
    }),
    accountLabels(),
    prisma.bankAccount.findMany({
      select: { id: true, name: true, nickname: true },
    }),
    prisma.paySchedule.findMany({ select: { id: true, name: true } }),
  ])) as [
    Array<{
      id: string;
      name: string;
      dueDay: number | null;
      paydayNumber: number | null;
      active: boolean;
    }>,
    Map<string, string>,
    Array<{ id: string; name: string; nickname: string | null }>,
    Array<{ id: string; name: string }>,
  ];
  const item = sameNameTags(items);
  const account = accounts;
  const bank = new Map(banks.map((b) => [b.id, b.nickname || b.name]));
  const schedule = new Map(schedules.map((s) => [s.id, s.name]));
  const steps: ChangeStep[] = [];
  const gone = new Set<string>(); // ids merged away or deleted by earlier steps

  for (const [n, op] of file.ops.entries()) {
    let text = "";
    let problem: string | null = null;
    let choice: ChangeStep["choice"] = null;
    const need = (ok: unknown, what: string) => {
      if (!ok && !problem) problem = `${what} not found`;
    };
    const cat = (r: string) => {
      const c = world.category(r);
      need(c && !gone.has(c.id), `Category "${r}"`);
      return c?.name ?? r;
    };
    const grp = (r: string) => {
      const g = world.group(r);
      need(g, `Budget "${r}"`);
      return g?.name ?? r;
    };
    const bill = (i: string) => {
      need(item.has(i) && !gone.has(i), "Bill");
      return item.get(i) ?? i;
    };
    switch (op.op) {
      case "renameAccount":
        need(account.has(op.accountId), "Account");
        text = `Rename account ${account.get(op.accountId)} to "${op.name}"`;
        break;
      case "setNickname":
        need(bank.has(op.bankAccountId), "Bank account");
        text = op.nickname
          ? `Call ${bank.get(op.bankAccountId)} "${op.nickname}"`
          : `Clear the nickname on ${bank.get(op.bankAccountId)}`;
        break;
      case "mergeAccount":
        need(account.has(op.fromId), "Account");
        need(account.has(op.intoId), "Account");
        text = `Move everything on account ${account.get(op.fromId)} to ${account.get(op.intoId) ?? op.intoId}, then remove ${account.get(op.fromId)}`;
        break;
      case "createCategory": {
        if (world.category(op.name)) problem = `"${op.name}" already exists`;
        const g = op.group ? grp(op.group) : null;
        text = `Add category "${op.name}"${g ? ` in ${g}` : ""}`;
        if (!problem) {
          const fake = `new:${op.name}`;
          world.categories.set(fake, { id: fake, name: op.name });
        }
        break;
      }
      case "renameCategory": {
        const c = world.category(op.category);
        const from = cat(op.category);
        const clash = world.category(op.name);
        if (clash && clash.id !== c?.id && !problem)
          problem = `"${op.name}" already exists (merge instead)`;
        text = `Rename category ${from} to "${op.name}"`;
        if (c && !problem)
          world.categories.set(c.id, { id: c.id, name: op.name });
        break;
      }
      case "mergeCategory": {
        const from = cat(op.from);
        const into = cat(op.into);
        text = `Merge category ${from} into ${into}: its transactions, bills and rules move`;
        const c = world.category(op.from);
        if (c && !problem) gone.add(c.id);
        break;
      }
      case "deleteCategory": {
        text = `Delete category ${cat(op.category)}`;
        const c = world.category(op.category);
        if (c && !problem) gone.add(c.id);
        break;
      }
      case "moveCategory":
        text = `Put category ${cat(op.category)} in ${op.group ? grp(op.group) : "no budget"}`;
        break;
      case "setGroupLimit":
        text = `Set ${grp(op.group)}'s limit to ${op.limitCents === null ? "automatic" : `$${(op.limitCents / 100).toFixed(0)}`}`;
        break;
      case "renameGroup": {
        const g = world.group(op.group);
        text = `Rename budget ${grp(op.group)} to "${op.name}"`;
        if (g && !problem) world.groups.set(g.id, { id: g.id, name: op.name });
        break;
      }
      case "deleteGroup":
        text = `Delete budget ${grp(op.group)} (its categories become unsorted)`;
        break;
      case "setBill": {
        const parts = [
          op.name ? `name "${op.name}"` : null,
          op.category !== undefined
            ? `category ${op.category === null ? "none" : cat(op.category)}`
            : null,
          op.kind ? `kind ${op.kind.toLowerCase()}` : null,
          op.active !== undefined ? (op.active ? "active" : "inactive") : null,
          op.startYear !== undefined
            ? `starts ${op.startYear ?? "—"}${op.startMonth ? `-${String(op.startMonth).padStart(2, "0")}` : ""}`
            : null,
          op.endYear !== undefined
            ? `ends ${op.endYear ?? "never"}${op.endMonth ? `-${String(op.endMonth).padStart(2, "0")}` : ""}`
            : null,
          op.paidFromId !== undefined
            ? `paid from ${op.paidFromId === null ? "—" : (account.get(op.paidFromId) ?? "?")}`
            : null,
          op.chargedToId !== undefined
            ? `on card ${op.chargedToId === null ? "none" : (account.get(op.chargedToId) ?? "?")}`
            : null,
          op.scheduleKind
            ? op.scheduleKind === "MONTHLY"
              ? "every month"
              : `months ${(op.months ?? []).join(", ")}`
            : null,
        ].filter(Boolean);
        if (op.paidFromId) need(account.has(op.paidFromId), "Account");
        if (op.chargedToId) need(account.has(op.chargedToId), "Card");
        text = `${bill(op.lineItemId)}: ${parts.join(", ")}`;
        if (op.name) item.set(op.lineItemId, op.name);
        break;
      }
      case "mergeBill":
        text = `Merge bill ${bill(op.fromId)} into ${bill(op.intoId)}: payments and months move`;
        if (!problem) gone.add(op.fromId);
        break;
      case "linkLoan":
        need(bank.has(op.bankAccountId), "Loan account");
        text = `${bill(op.lineItemId)} pays off ${bank.get(op.bankAccountId) ?? op.bankAccountId} (balance from the bank)`;
        break;
      case "linkPaycheck":
        if (op.scheduleId) need(schedule.has(op.scheduleId), "Pay schedule");
        text = op.scheduleId
          ? `${bill(op.lineItemId)} comes on the ${schedule.get(op.scheduleId)} schedule`
          : `${bill(op.lineItemId)} off its pay schedule`;
        break;
      case "setAmount":
        text = `${bill(op.lineItemId)}: usual amount $${(op.cents / 100).toFixed(2)}${op.from ? ` from ${op.from}` : " from the next unpaid month"}`;
        break;
      case "setTarget":
        text = `${bill(op.lineItemId)}: ${op.on ? "varies month to month (a target)" : "a set amount"}`;
        break;
      case "addBill": {
        if (op.category) cat(op.category);
        if (op.paysCard) need(bank.has(op.paysCard), "Card");
        const when = op.months
          ? op.months
              .map((m) =>
                new Date(Date.UTC(2000, m - 1, 1)).toLocaleString("en-US", {
                  month: "short",
                  timeZone: "UTC",
                }),
              )
              .join(", ")
          : "every month";
        text = `Add ${op.kind === "INCOME" ? "paycheck" : op.kind === "SETTLEMENT" ? "card payment" : "bill"} "${op.name}" $${(op.cents / 100).toFixed(2)} on day ${op.dueDay}, ${when}${op.from ? ` from ${op.from}` : ""}${op.paysCard ? ` (pays ${bank.get(op.paysCard) ?? "card"})` : ""}`;
        break;
      }
      case "categorize":
        text = `Set ${count(op.transactionIds.length, "transaction")} to ${op.category === null ? "no category" : cat(op.category)}`;
        break;
      case "markTransfer":
        text = `Mark ${count(op.transactionIds.length, "transaction")} as transfers between your accounts`;
        break;
      case "unlinkPayment":
        text = `Unpair ${count(op.actualIds.length, "recorded payment")} from the wrong bank charge`;
        break;
      case "addBillRule":
        text = op.coversAll
          ? `Every charge from "${op.merchant}" pays ${bill(op.lineItemId)}`
          : `${bill(op.lineItemId)} is paid by charges from "${op.merchant}"`;
        break;
      case "removeBillRule":
        text = `${bill(op.lineItemId)}: forget a merchant it learned`;
        break;
      case "addCategoryRule":
        text = `Charges from "${op.merchant}" go to ${cat(op.category)}`;
        break;
      case "choose": {
        const opts = (
          op.options?.length
            ? op.options
                .map((o) => world.category(o))
                .filter((c): c is { id: string; name: string } => !!c)
            : [...world.categories.values()]
        ).filter((c) => !gone.has(c.id));
        text = op.label;
        choice = {
          transactionId: op.transactionId,
          options: opts.sort((a, b) => a.name.localeCompare(b.name)),
        };
        break;
      }
    }
    steps.push({ n, text, problem, choice });
  }
  return { note: file.note ?? null, steps };
}

/**
 * Applies the file's steps in order (a step that can't be done is skipped and reported), then
 * pairs recorded payments with charges again and reapplies category rules.
 */
export async function applyChanges(
  text: string,
  choices: Record<string, string>,
): Promise<{
  applied: number;
  skipped: Array<{ n: number; problem: string }>;
}> {
  const file = await resolveBills(parseChanges(text));
  const world = await new World().load();
  const skipped: Array<{ n: number; problem: string }> = [];
  let applied = 0;
  const catId = (r: string) => {
    const c = world.category(r);
    if (!c) throw new Error(`Category "${r}" not found`);
    return c.id;
  };
  const groupId = (r: string) => {
    const g = world.group(r);
    if (!g) throw new Error(`Budget "${r}" not found`);
    return g.id;
  };
  const chunks = <T>(xs: T[], size = 1000) =>
    Array.from({ length: Math.ceil(xs.length / size) }, (_, i) =>
      xs.slice(i * size, i * size + size),
    );

  for (const [n, op] of file.ops.entries()) {
    try {
      switch (op.op) {
        case "renameAccount":
          await prisma.account.update({
            where: { id: op.accountId },
            data: { name: op.name.trim() },
          });
          break;
        case "setNickname":
          await prisma.bankAccount.update({
            where: { id: op.bankAccountId },
            data: { nickname: op.nickname?.trim() || null },
          });
          break;
        case "mergeAccount": {
          if (op.fromId === op.intoId) throw new Error("Same account");
          await prisma.lineItem.updateMany({
            where: { chargedToId: op.fromId },
            data: { chargedToId: op.intoId },
          });
          await prisma.lineItem.updateMany({
            where: { paidFromId: op.fromId },
            data: { paidFromId: op.intoId },
          });
          await prisma.lineItem.updateMany({
            where: { paysCardId: op.fromId },
            data: { paysCardId: op.intoId },
          });
          await prisma.account.updateMany({
            where: { settledById: op.fromId },
            data: { settledById: op.intoId },
          });
          const bills = (await prisma.setting.findUnique({
            where: { key: SETTING_KEYS.billsAccountId },
          })) as { value: unknown } | null;
          if (bills?.value === op.fromId)
            await prisma.setting.update({
              where: { key: SETTING_KEYS.billsAccountId },
              data: { value: op.intoId as never },
            });
          const balances = await prisma.balanceSnapshot.count({
            where: { accountId: op.fromId },
          });
          if (balances)
            await prisma.account.update({
              where: { id: op.fromId },
              data: { active: false },
            });
          else await prisma.account.delete({ where: { id: op.fromId } });
          break;
        }
        case "createCategory": {
          const made = (await prisma.category.create({
            data: {
              name: op.name.trim(),
              active: true,
              groupId: op.group ? groupId(op.group) : null,
            },
            select: { id: true, name: true },
          })) as { id: string; name: string };
          world.categories.set(made.id, made);
          break;
        }
        case "renameCategory": {
          const cid = catId(op.category);
          await prisma.category.update({
            where: { id: cid },
            data: { name: op.name.trim() },
          });
          world.categories.set(cid, { id: cid, name: op.name.trim() });
          break;
        }
        case "mergeCategory": {
          const from = catId(op.from);
          const into = catId(op.into);
          if (from === into) throw new Error("Same category");
          await prisma.bankTransaction.updateMany({
            where: { categoryId: from },
            data: { categoryId: into },
          });
          await prisma.transactionSplit.updateMany({
            where: { categoryId: from },
            data: { categoryId: into },
          });
          await prisma.lineItem.updateMany({
            where: { categoryId: from },
            data: { categoryId: into },
          });
          await prisma.categoryRule.updateMany({
            where: { categoryId: from },
            data: { categoryId: into },
          });
          await prisma.category.delete({ where: { id: from } });
          world.categories.delete(from);
          break;
        }
        case "deleteCategory": {
          const cid = catId(op.category);
          await prisma.bankTransaction.updateMany({
            where: { categoryId: cid },
            data: { categoryId: null, categorySource: "guess" },
          });
          await prisma.lineItem.updateMany({
            where: { categoryId: cid },
            data: { categoryId: null },
          });
          await prisma.category.delete({ where: { id: cid } });
          world.categories.delete(cid);
          break;
        }
        case "moveCategory":
          await prisma.category.update({
            where: { id: catId(op.category) },
            data: { groupId: op.group ? groupId(op.group) : null },
          });
          break;
        case "setGroupLimit":
          await prisma.categoryGroup.update({
            where: { id: groupId(op.group) },
            data: { limitCents: op.limitCents },
          });
          break;
        case "renameGroup": {
          const gid = groupId(op.group);
          await prisma.categoryGroup.update({
            where: { id: gid },
            data: { name: op.name.trim() },
          });
          world.groups.set(gid, { id: gid, name: op.name.trim() });
          break;
        }
        case "deleteGroup": {
          const gid = groupId(op.group);
          await prisma.categoryGroup.delete({ where: { id: gid } });
          world.groups.delete(gid);
          break;
        }
        case "setBill": {
          const data: Record<string, unknown> = {};
          if (op.name) data.name = op.name.trim();
          if (op.category !== undefined)
            data.categoryId = op.category === null ? null : catId(op.category);
          if (op.kind) data.kind = op.kind;
          if (op.active !== undefined) data.active = op.active;
          for (const k of [
            "startYear",
            "startMonth",
            "endYear",
            "endMonth",
            "paidFromId",
            "chargedToId",
          ] as const)
            if (op[k] !== undefined) data[k] = op[k];
          if (op.scheduleKind === "MONTHLY")
            Object.assign(data, {
              scheduleKind: "MONTHLY",
              months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
            });
          else if (op.scheduleKind === "CUSTOM" && op.months)
            Object.assign(data, {
              scheduleKind: "CUSTOM",
              months: [...new Set(op.months)].sort((a, b) => a - b),
            });
          await prisma.lineItem.update({ where: { id: op.lineItemId }, data });
          break;
        }
        case "mergeBill": {
          const { mergeLineItem } = await import("./line-items");
          await mergeLineItem(op.fromId, op.intoId);
          break;
        }
        case "linkLoan":
          await prisma.lineItem.update({
            where: { id: op.lineItemId },
            data: {
              payoffAccountId: op.bankAccountId,
              payoffBalance: null,
              payoffAsOf: null,
            },
          });
          break;
        case "linkPaycheck": {
          const { linkPaycheck } = await import("./pay-schedule");
          await linkPaycheck(op.lineItemId, op.scheduleId);
          break;
        }
        case "setAmount": {
          const { changeUsualAmount, billAmountHistory } =
            await import("./bill-amounts");
          await changeUsualAmount(
            op.lineItemId,
            op.cents,
            op.from ?? (await billAmountHistory(op.lineItemId)).startsFrom,
          );
          break;
        }
        case "setTarget": {
          const { setBillTarget } = await import("./bill-amounts");
          await setBillTarget(op.lineItemId, op.on);
          break;
        }
        case "addBill": {
          const { createLineItem } = await import("./line-items");
          // A card payment points at the card's ledger account.
          const ledger = op.paysCard
            ? (
                (await prisma.bankAccount.findUnique({
                  where: { id: op.paysCard },
                  select: { linkedAccountId: true },
                })) as { linkedAccountId: string | null } | null
              )?.linkedAccountId
            : null;
          await createLineItem({
            name: op.name,
            kind: op.kind,
            plannedAmountCents: op.cents,
            dueDay: op.dueDay,
            categoryId: op.category ? catId(op.category) : null,
            paysCard: ledger ?? (op.kind === "SETTLEMENT" ? "auto" : "none"),
            scheduleKind:
              op.months && op.months.length < 12 ? "CUSTOM" : "MONTHLY",
            ...(op.months && op.months.length < 12
              ? { months: op.months, anchorMonth: op.months[0] }
              : {}),
            ...(op.from
              ? {
                  startYear: Number(op.from.slice(0, 4)),
                  startMonth: Number(op.from.slice(5, 7)),
                }
              : {}),
          });
          break;
        }
        case "categorize": {
          const cid = op.category === null ? null : catId(op.category);
          for (const part of chunks(op.transactionIds))
            await prisma.bankTransaction.updateMany({
              where: { id: { in: part } },
              data: { categoryId: cid, categorySource: "person" },
            });
          break;
        }
        case "markTransfer":
          await (
            await import("./transfer-mark")
          ).markTransfers(op.transactionIds);
          break;
        case "unlinkPayment":
          for (const part of chunks(op.actualIds))
            await prisma.actualEntry.updateMany({
              where: { id: { in: part } },
              data: { bankTransactionId: null },
            });
          break;
        case "addBillRule": {
          const key = merchantKey(op.merchant);
          await prisma.billRule.upsert({
            where: {
              lineItemId_merchantKey: {
                lineItemId: op.lineItemId,
                merchantKey: key,
              },
            },
            create: {
              lineItemId: op.lineItemId,
              merchantKey: key,
              coversAll: !!op.coversAll,
            },
            update: { coversAll: !!op.coversAll },
          });
          break;
        }
        case "removeBillRule":
          await prisma.billRule.deleteMany({
            where: { lineItemId: op.lineItemId, merchantKey: op.merchantKey },
          });
          break;
        case "addCategoryRule": {
          const key = merchantKey(op.merchant);
          const cid = catId(op.category);
          await prisma.categoryRule.upsert({
            where: { merchantKey: key },
            create: { merchantKey: key, categoryId: cid },
            update: { categoryId: cid },
          });
          break;
        }
        case "choose": {
          const picked = choices[op.transactionId];
          if (!picked) throw new Error("Not picked: left as it was");
          await prisma.bankTransaction.update({
            where: { id: op.transactionId },
            data: { categoryId: catId(picked), categorySource: "person" },
          });
          break;
        }
      }
      applied += 1;
    } catch (error) {
      skipped.push({
        n,
        problem:
          error instanceof Error
            ? error.message.split("\n").slice(-1)[0].slice(0, 200)
            : String(error),
      });
    }
  }
  const [{ applyCategories }, { linkRecordedPayments }] = await Promise.all([
    import("./categorize"),
    import("./bills-auto"),
  ]);
  await applyCategories().catch(() => 0);
  await linkRecordedPayments().catch(() => 0);
  return { applied, skipped };
}

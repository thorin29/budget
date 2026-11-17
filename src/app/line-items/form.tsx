"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { ErrorBanner, Field, Segmented, Select, TextInput, buttonClass } from "@/components/ui";
import type { FormState } from "./actions";
import { DeleteLineItem } from "./row";

const INITIAL: FormState = { ok: true };

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export interface LineItemDefaults {
  id?: string;
  name: string;
  kind: string;
  categoryId: string | null;
  paidFromId: string | null;
  chargedToId: string | null;
  payScheduleId: string | null;
  plannedAmount: string;
  dueDay: number | null;
  periodAssignment: string;
  paidFromSurplus: boolean;
  autoRecord: boolean;
  /** "auto", "none", or a credit card account id. */
  paysCard: string;
  /** The card the bank worked out, shown while the choice is "auto". */
  paysCardLearned: string | null;
  /** Paying off a balance: "none", "balance" (typed in, as of a date) or "account" (a loan in the feed). */
  payoffMode: string;
  payoffBalance: string;
  payoffAsOf: string;
  payoffAccountId: string | null;
  /** What's left now and when it ends, when it pays off a balance. */
  payoffSummary: string | null;
  paydayNumber: number | null;
  scheduleKind: string;
  anchorMonth: number;
  months: number[];
  onlyYear: number | null;
  startYear: number | null;
  startMonth: number | null;
  endYear: number | null;
  endMonth: number | null;
  paymentUrl: string;
  notes: string;
  active: boolean;
}

const SCHEDULES = [
  { value: "MONTHLY", label: "Every month" },
  { value: "QUARTERLY", label: "Quarterly" },
  { value: "SEMI_ANNUAL", label: "Twice a year" },
  { value: "ANNUAL", label: "Once a year" },
  { value: "CUSTOM", label: "Specific months" },
  { value: "ONE_OFF", label: "One-off" },
];

/** The months a schedule falls in, for the grid. Mirrors the server's rule. */
function monthsFor(kind: string, anchor: number, custom: number[]): number[] {
  const wrap = (m: number) => ((m - 1) % 12) + 1;
  switch (kind) {
    case "MONTHLY":
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    case "QUARTERLY":
      return [anchor, anchor + 3, anchor + 6, anchor + 9].map(wrap);
    case "SEMI_ANNUAL":
      return [anchor, anchor + 6].map(wrap);
    case "ANNUAL":
    case "ONE_OFF":
      return [anchor];
    default:
      return custom;
  }
}

function Switch({
  name,
  defaultChecked,
  label,
  detail,
}: {
  name: string;
  defaultChecked: boolean;
  label: string;
  detail: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-sunken p-3.5">
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="peer sr-only" />
      <span
        aria-hidden
        className="relative mt-0.5 h-5 w-9 shrink-0 rounded-full bg-line-strong transition peer-checked:bg-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent after:absolute after:left-0.5 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition peer-checked:after:translate-x-4"
      />
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="mt-0.5 block text-xs text-muted">{detail}</span>
      </span>
    </label>
  );
}

export function LineItemForm({
  action,
  defaults,
  categories,
  accounts,
  cards,
  paySchedules,
  loans = [],
  submitLabel,
  cancelHref = "/line-items",
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  defaults: LineItemDefaults;
  categories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
  cards: Array<{ id: string; name: string }>;
  paySchedules: Array<{ id: string; name: string }>;
  /** Loan and mortgage accounts from the bank feed, to follow a balance. */
  loans?: Array<{ id: string; name: string }>;
  submitLabel: string;
  cancelHref?: string;
}) {
  const [state, submit, pending] = useActionState(action, INITIAL);
  const [kind, setKind] = useState(defaults.kind);
  const [scheduleKind, setScheduleKind] = useState(defaults.scheduleKind);
  const [anchor, setAnchor] = useState(defaults.anchorMonth);
  const [custom, setCustom] = useState<number[]>(
    defaults.scheduleKind === "CUSTOM" ? defaults.months : monthsFor(defaults.scheduleKind, defaults.anchorMonth, defaults.months),
  );
  const [dueDay, setDueDay] = useState<string>(defaults.dueDay ? String(defaults.dueDay) : "");
  const [payoffMode, setPayoffMode] = useState(defaults.payoffMode);

  const isIncome = kind === "INCOME";
  const needsAnchor = ["QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_OFF"].includes(scheduleKind);
  const selectedMonths = monthsFor(scheduleKind, anchor, custom);

  // Clicking a month turns whatever pattern was showing into a custom set.
  const toggleMonth = (m: number) => {
    const base = new Set(selectedMonths);
    if (base.has(m)) base.delete(m);
    else base.add(m);
    setCustom([...base].sort((a, b) => a - b));
    setScheduleKind("CUSTOM");
  };

  const bumpDay = (by: number) => {
    const current = Number(dueDay) || (by > 0 ? 0 : 2);
    setDueDay(String(Math.min(31, Math.max(1, current + by))));
  };

  return (
    <form action={submit} className="flex h-full flex-col">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="scheduleKind" value={scheduleKind} />
      <input type="hidden" name="anchorMonth" value={anchor} />
      {scheduleKind === "CUSTOM"
        ? custom.map((m) => <input key={m} type="hidden" name="months" value={m} />)
        : null}

      <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
        <ErrorBanner message={state.ok ? undefined : state.message} />

        <Field label="Name" error={state.issues?.name}>
          <TextInput name="name" defaultValue={defaults.name} required maxLength={80} autoComplete="off" autoFocus={!defaults.id} />
        </Field>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Kind</span>
          <Segmented
            name="kind"
            value={kind}
            onChange={setKind}
            options={[
              { value: "BILL", label: "Bill" },
              { value: "SETTLEMENT", label: "Card payoff" },
              { value: "INCOME", label: "Income" },
            ]}
          />
          <span className="mt-1.5 block text-xs text-muted">
            {kind === "SETTLEMENT"
              ? "A balance you pay off — the amount changes month to month."
              : kind === "BILL"
                ? "A known recurring obligation."
                : "Money in."}
          </span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={isIncome ? "Expected amount" : "Usual amount"}
            hint={isIncome ? "Per arrival. An estimate is fine." : "A single month that differs is changed on the month view."}
            error={state.issues?.plannedAmountCents}
          >
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-subtle">$</span>
              <TextInput
                name="plannedAmount"
                defaultValue={defaults.plannedAmount}
                inputMode="decimal"
                className="tnum pl-6"
                required
              />
            </div>
          </Field>

          <Field
            label={isIncome ? "Arrives around day" : "Due around day"}
            hint="Approximate is fine."
            error={state.issues?.dueDay}
          >
            <div className="flex">
              <button
                type="button"
                onClick={() => bumpDay(-1)}
                aria-label="Earlier"
                className="rounded-l-[10px] border border-r-0 border-line-strong bg-surface px-3 text-muted hover:bg-neutral-soft"
              >
                −
              </button>
              <TextInput
                type="number"
                name="dueDay"
                min={1}
                max={31}
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                className="tnum rounded-none text-center"
              />
              <button
                type="button"
                onClick={() => bumpDay(1)}
                aria-label="Later"
                className="rounded-r-[10px] border border-l-0 border-line-strong bg-surface px-3 text-muted hover:bg-neutral-soft"
              >
                +
              </button>
            </div>
          </Field>
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">How often</span>
          <div className="flex flex-wrap gap-1.5">
            {SCHEDULES.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => setScheduleKind(s.value)}
                aria-pressed={scheduleKind === s.value}
                className={`rounded-full border px-3 py-1 text-sm font-medium transition ${
                  scheduleKind === s.value
                    ? "border-accent bg-accent-soft text-accent-ink"
                    : "border-line-strong text-muted hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="mt-3 grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {MONTH_NAMES.map((m, i) => {
              const on = selectedMonths.includes(i + 1);
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => toggleMonth(i + 1)}
                  aria-pressed={on}
                  className={`rounded-lg py-1.5 text-xs font-semibold transition ${
                    on ? "bg-accent text-on-accent" : "bg-neutral-soft text-muted hover:text-foreground"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
          {state.issues?.months?.length ? (
            <span className="mt-1.5 block text-xs text-danger">{state.issues.months.join(". ")}</span>
          ) : null}

          {needsAnchor ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="w-40">
                <span className="mb-1.5 block text-xs font-semibold text-muted">
                  {scheduleKind === "QUARTERLY" || scheduleKind === "SEMI_ANNUAL" ? "Starting in" : "In"}
                </span>
                <Select value={anchor} onChange={(e) => setAnchor(Number(e.target.value))}>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
              </label>
              {scheduleKind === "ONE_OFF" ? (
                <label className="w-32">
                  <span className="mb-1.5 block text-xs font-semibold text-muted">Year</span>
                  <TextInput
                    type="number"
                    name="onlyYear"
                    min={1900}
                    max={2999}
                    defaultValue={defaults.onlyYear ?? new Date().getFullYear()}
                  />
                </label>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={isIncome ? "Paid into" : "Paid from"} error={state.issues?.paidFromId}>
            <Select name="paidFromId" defaultValue={defaults.paidFromId ?? ""}>
              <option value="">—</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Category" error={state.issues?.categoryId}>
            <Select name="categoryId" defaultValue={defaults.categoryId ?? ""}>
              <option value="">—</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>

          {isIncome && paySchedules.length > 0 ? (
            <Field
              label="Arrives on"
              hint="Lands on every payday the calendar generates — a three-payday month counts three."
              error={state.issues?.payScheduleId}
            >
              <Select name="payScheduleId" defaultValue={defaults.payScheduleId ?? ""}>
                <option value="">Once a month, on the day above</option>
                {paySchedules.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}

          {!isIncome && cards.length > 0 ? (
            <Field
              label="Charged to"
              hint="Reporting only — it does not change what must be in the bank."
              error={state.issues?.chargedToId}
            >
              <Select name="chargedToId" defaultValue={defaults.chargedToId ?? ""}>
                <option value="">—</option>
                {cards.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
        </div>

        <div>
          <span className="mb-1.5 block text-[13px] font-semibold">Half of the month</span>
          <Segmented
            name="periodAssignment"
            defaultValue={defaults.periodAssignment}
            options={[
              { value: "AUTO", label: "Follow due day" },
              { value: "FIRST", label: "First" },
              { value: "SECOND", label: "Second" },
            ]}
          />
        </div>

        {!isIncome ? (
          <Switch
            name="paidFromSurplus"
            defaultChecked={defaults.paidFromSurplus}
            label="Paid from what’s left over"
            detail="For a card you pay with whatever remains once the bills are covered. It stops counting against the free money, and What can I pay? shows what you can send it."
          />
        ) : null}

        {isIncome ? (
          <Field label="Arrives on" hint="With a pay calendar, a 3rd paycheck only shows in months that have three paydays">
            <Select name="paydayNumber" defaultValue={String(defaults.paydayNumber ?? 0)}>
              <option value="0">Its due day</option>
              <option value="1">The 1st payday of the month</option>
              <option value="2">The 2nd payday of the month</option>
              <option value="3">The 3rd payday of the month</option>
              <option value="4">The 4th payday of the month</option>
              <option value="5">The 5th payday of the month</option>
            </Select>
          </Field>
        ) : null}

        {!isIncome && cards.length > 0 ? (
          <Field
            label="Pays a card"
            hint={
              defaults.paysCard === "auto" && defaults.paysCardLearned
                ? `Worked out from the bank: ${defaults.paysCardLearned}. Payments reaching it are recorded here on their own.`
                : "For a card payment: payments reaching that card are recorded here on their own, whatever the amount."
            }
            error={state.issues?.paysCard}
          >
            <Select name="paysCard" defaultValue={defaults.paysCard}>
              <option value="auto">Work it out from the bank</option>
              <option value="none">Not a card payment</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Switch
          name="autoRecord"
          defaultChecked={defaults.autoRecord}
          label={isIncome ? "Record it when it arrives" : "Record it when the bank shows it paid"}
          detail="Once a merchant has been tied to this item, its charge around the due day is recorded on its own, even when the amount changes, with an Undo on the Review page. A charge from a merchant it doesn't know yet still waits for you."
        />

        {!isIncome ? (
          <div className="rounded-xl border border-line p-4">
            <span className="block text-[13px] font-semibold">Pays off a balance</span>
            <span className="mt-0.5 block text-xs text-muted">
              For a loan, a mortgage or a payment plan: track what&rsquo;s left, and the bill ends on its own when it reaches zero.
            </span>
            {defaults.payoffSummary ? <p className="mt-2 rounded-lg bg-neutral-soft px-3 py-2 text-sm font-semibold">{defaults.payoffSummary}</p> : null}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Field label="Balance from">
                <Select name="payoffMode" value={payoffMode} onChange={(e) => setPayoffMode(e.target.value)}>
                  <option value="none">Not paying off a balance</option>
                  <option value="balance">A balance I enter</option>
                  {loans.length ? <option value="account">A loan account from the bank</option> : null}
                </Select>
              </Field>
              {payoffMode === "balance" ? (
                <>
                  <Field label="Left to pay" hint="Payments recorded after the date count it down">
                    <TextInput name="payoffBalance" inputMode="decimal" defaultValue={defaults.payoffBalance} placeholder="0.00" />
                  </Field>
                  <Field label="As of" hint="Update both now and then for a loan with interest">
                    <TextInput name="payoffAsOf" type="date" defaultValue={defaults.payoffAsOf} />
                  </Field>
                </>
              ) : null}
              {payoffMode === "account" ? (
                <Field label="Loan account" hint="Its balance comes from the bank, interest included">
                  <Select name="payoffAccountId" defaultValue={defaults.payoffAccountId ?? ""}>
                    <option value="">—</option>
                    {loans.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
            </div>
          </div>
        ) : null}

        <details className="group rounded-xl border border-line">
          <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">
            <span className="inline-block transition group-open:rotate-90">›</span> Details
            <span className="ml-2 font-normal text-muted">link, notes, start and end</span>
          </summary>
          <div className="grid gap-4 border-t border-line p-4 sm:grid-cols-2">
            <Field
              label="Payment link"
              hint="Stored only in your database."
              error={state.issues?.paymentUrl}
            >
              <TextInput name="paymentUrl" type="url" defaultValue={defaults.paymentUrl} placeholder="https://" />
            </Field>

            <Field label="Notes" error={state.issues?.notes}>
              <TextInput name="notes" defaultValue={defaults.notes} maxLength={2000} />
            </Field>

            <Field label="Starts" hint="Leave empty unless it began partway through" error={state.issues?.startYear}>
              <div className="flex gap-2">
                <Select name="startMonth" defaultValue={defaults.startMonth ?? ""}>
                  <option value="">—</option>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
                <TextInput type="number" name="startYear" placeholder="Year" defaultValue={defaults.startYear ?? ""} />
              </div>
            </Field>

            <Field label="Ends" hint="Leave empty for anything ongoing" error={state.issues?.endYear}>
              <div className="flex gap-2">
                <Select name="endMonth" defaultValue={defaults.endMonth ?? ""}>
                  <option value="">—</option>
                  {MONTH_NAMES.map((m, i) => (
                    <option key={m} value={i + 1}>
                      {m}
                    </option>
                  ))}
                </Select>
                <TextInput type="number" name="endYear" placeholder="Year" defaultValue={defaults.endYear ?? ""} />
              </div>
            </Field>

            <Field label="Status" hint="Inactive hides it everywhere without ending it">
              <Select name="active" defaultValue={String(defaults.active)}>
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </Select>
            </Field>
          </div>
        </details>
      </div>

      <div className="flex items-center gap-2 border-t border-line bg-sunken px-6 py-4">
        {defaults.id ? <DeleteLineItem id={defaults.id} name={defaults.name} /> : null}
        <span className="flex-1" />
        <Link href={cancelHref} className={buttonClass("quiet")}>
          Cancel
        </Link>
        <button type="submit" disabled={pending} className={buttonClass("primary")}>
          {pending ? "Saving…" : submitLabel}
        </button>
      </div>
    </form>
  );
}

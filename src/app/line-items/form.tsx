"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { Button, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui";
import type { FormState } from "./actions";

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

export function LineItemForm({
  action,
  defaults,
  categories,
  accounts,
  cards,
  paySchedules,
  submitLabel,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  defaults: LineItemDefaults;
  categories: Array<{ id: string; name: string }>;
  accounts: Array<{ id: string; name: string }>;
  cards: Array<{ id: string; name: string }>;
  paySchedules: Array<{ id: string; name: string }>;
  submitLabel: string;
}) {
  const [state, submit, pending] = useActionState(action, INITIAL);
  const [kind, setKind] = useState(defaults.kind);
  const [scheduleKind, setScheduleKind] = useState(defaults.scheduleKind);

  const isIncome = kind === "INCOME";
  const needsAnchor = ["QUARTERLY", "SEMI_ANNUAL", "ANNUAL", "ONE_OFF"].includes(scheduleKind);
  const isCustom = scheduleKind === "CUSTOM";

  return (
    <form action={submit}>
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <ErrorBanner message={state.ok ? undefined : state.message} />

      <Card className="grid gap-5 sm:grid-cols-2">
        <Field label="Name" error={state.issues?.name}>
          <TextInput name="name" defaultValue={defaults.name} required maxLength={80} autoComplete="off" />
        </Field>

        <Field
          label="Kind"
          hint={
            kind === "SETTLEMENT"
              ? "A balance you pay off — the amount is expected to change monthly"
              : kind === "BILL"
                ? "A known recurring obligation"
                : "Money in"
          }
          error={state.issues?.kind}
        >
          <Select name="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="BILL">Bill</option>
            <option value="SETTLEMENT">Card settlement</option>
            <option value="INCOME">Income</option>
          </Select>
        </Field>

        <Field
          label={isIncome ? "Expected amount" : "Planned amount"}
          hint={
            isIncome
              ? "Per arrival. An estimate is fine — the projection is for planning."
              : "The usual figure. A single month that differs is edited on the month view."
          }
          error={state.issues?.plannedAmountCents}
        >
          <TextInput
            name="plannedAmount"
            defaultValue={defaults.plannedAmount}
            inputMode="decimal"
            required
          />
        </Field>

        <Field
          label={isIncome ? "Arrives around day" : "Due around day"}
          hint="Approximate is fine — it only places the item in a half"
          error={state.issues?.dueDay}
        >
          <TextInput
            type="number"
            name="dueDay"
            min={1}
            max={31}
            defaultValue={defaults.dueDay ?? ""}
          />
        </Field>

        <Field label="Category" error={state.issues?.categoryId}>
          <Select name="categoryId" defaultValue={defaults.categoryId ?? ""}>
            <option value="">—</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>

        <Field
          label={isIncome ? "Paid into" : "Paid from"}
          hint={isIncome ? undefined : "The account the money leaves"}
          error={state.issues?.paidFromId}
        >
          <Select name="paidFromId" defaultValue={defaults.paidFromId ?? ""}>
            <option value="">—</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </Select>
        </Field>

        {isIncome && paySchedules.length > 0 ? (
          <Field
            label="Arrives on"
            hint="Pick a pay calendar and the amount lands on every payday it generates — a three-payday month counts three. Leave as a single monthly arrival otherwise."
            error={state.issues?.payScheduleId}
          >
            <Select name="payScheduleId" defaultValue={defaults.payScheduleId ?? ""}>
              <option value="">Once a month, on the day above</option>
              {paySchedules.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        {!isIncome && cards.length > 0 ? (
          <Field
            label="Charged to"
            hint="If this lands on a card. Reporting only — it does not change what must be in the bank."
            error={state.issues?.chargedToId}
          >
            <Select name="chargedToId" defaultValue={defaults.chargedToId ?? ""}>
              <option value="">—</option>
              {cards.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        <Field
          label="Half of the month"
          hint="Auto follows the due day. Pin it if you pay it on a different rhythm."
          error={state.issues?.periodAssignment}
        >
          <Select name="periodAssignment" defaultValue={defaults.periodAssignment}>
            <option value="AUTO">Auto</option>
            <option value="FIRST">First half</option>
            <option value="SECOND">Second half</option>
          </Select>
        </Field>
      </Card>

      <Card className="mt-4 grid gap-5 sm:grid-cols-2">
        <Field label="How often" error={state.issues?.scheduleKind}>
          <Select
            name="scheduleKind"
            value={scheduleKind}
            onChange={(e) => setScheduleKind(e.target.value)}
          >
            <option value="MONTHLY">Every month</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="SEMI_ANNUAL">Twice a year</option>
            <option value="ANNUAL">Once a year</option>
            <option value="CUSTOM">Specific months</option>
            <option value="ONE_OFF">One-off</option>
          </Select>
        </Field>

        {needsAnchor ? (
          <Field
            label="Starting in"
            hint={
              scheduleKind === "QUARTERLY"
                ? "And every three months from there"
                : scheduleKind === "SEMI_ANNUAL"
                  ? "And six months later"
                  : "The month it falls in"
            }
            error={state.issues?.anchorMonth}
          >
            <Select name="anchorMonth" defaultValue={defaults.anchorMonth}>
              {MONTH_NAMES.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </Select>
          </Field>
        ) : null}

        {scheduleKind === "ONE_OFF" ? (
          <Field label="In year" error={state.issues?.onlyYear}>
            <TextInput
              type="number"
              name="onlyYear"
              min={1900}
              max={2999}
              defaultValue={defaults.onlyYear ?? new Date().getFullYear()}
            />
          </Field>
        ) : null}

        {isCustom ? (
          <div className="sm:col-span-2">
            <span className="mb-1 block text-sm font-medium">Months</span>
            <div className="flex flex-wrap gap-2">
              {MONTH_NAMES.map((m, i) => (
                <label
                  key={m}
                  className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    name="months"
                    value={i + 1}
                    defaultChecked={defaults.months.includes(i + 1)}
                  />
                  {m}
                </label>
              ))}
            </div>
            {state.issues?.months?.length ? (
              <span className="mt-1 block text-xs text-danger">
                {state.issues.months.join(". ")}
              </span>
            ) : null}
          </div>
        ) : null}
      </Card>

      <details className="mt-4">
        <summary className="cursor-pointer text-sm text-muted">More</summary>
        <Card className="mt-3 grid gap-5 sm:grid-cols-2">
          <Field
            label="Payment link"
            hint="Opens the biller's payment page. Stored only in your database."
            error={state.issues?.paymentUrl}
          >
            <TextInput
              name="paymentUrl"
              type="url"
              defaultValue={defaults.paymentUrl}
              placeholder="https://"
            />
          </Field>

          <Field label="Notes" error={state.issues?.notes}>
            <TextInput name="notes" defaultValue={defaults.notes} maxLength={2000} />
          </Field>

          <Field
            label="Starts"
            hint="Leave empty unless it began partway through"
            error={state.issues?.startYear}
          >
            <div className="flex gap-2">
              <Select name="startMonth" defaultValue={defaults.startMonth ?? ""}>
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
              <TextInput
                type="number"
                name="startYear"
                placeholder="Year"
                defaultValue={defaults.startYear ?? ""}
              />
            </div>
          </Field>

          <Field
            label="Ends"
            hint="Leave empty for anything ongoing"
            error={state.issues?.endYear}
          >
            <div className="flex gap-2">
              <Select name="endMonth" defaultValue={defaults.endMonth ?? ""}>
                <option value="">—</option>
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </Select>
              <TextInput
                type="number"
                name="endYear"
                placeholder="Year"
                defaultValue={defaults.endYear ?? ""}
              />
            </div>
          </Field>

          <Field label="Active" hint="Hides it everywhere without ending it">
            <Select name="active" defaultValue={String(defaults.active)}>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </Select>
          </Field>
        </Card>
      </details>

      <div className="mt-5 flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href="/line-items" className="text-sm text-muted hover:text-foreground">
          Cancel
        </Link>
      </div>
    </form>
  );
}

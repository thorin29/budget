"use client";

import { useActionState } from "react";
import { savePreferencesAction, type FormState } from "../actions";
import { Button, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function PreferencesForm({
  bankAccounts,
  settings,
  schedules = [],
  splitSchedule = null,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
  /** Pay schedules, any of which can divide the month. */
  schedules?: Array<{ id: string; name: string }>;
  splitSchedule?: string | null;
  settings: {
    splitDay: number;
    splitMode?: "payday" | "day";
    horizonDays: number;
    buffer: string;
    carryMonths: number;
    billsAccountId: string | null;
  };
}) {
  const [state, action, pending] = useActionState(savePreferencesAction, INITIAL);

  return (
    <Card>
      <ErrorBanner message={state.ok ? undefined : state.message} />
      {state.ok && state.message === undefined ? null : null}

      <form action={action} className="grid gap-5 sm:grid-cols-2">
        <Field label="Bills account" error={state.issues?.billsAccountId}>
          <Select name="billsAccountId" defaultValue={settings.billsAccountId ?? ""}>
            <option value="">—</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Divide the month at">
          <Select name="splitMode" defaultValue={settings.splitMode === "day" ? "day" : splitSchedule && schedules.some((s) => s.id === splitSchedule) ? `payday:${splitSchedule}` : "payday"}>
            <option value="payday">Payday nearest the 15th{schedules.length > 1 ? " (main paycheck)" : ""}</option>
            {schedules.length > 1
              ? schedules.map((s) => (
                  <option key={s.id} value={`payday:${s.id}`}>
                    {s.name}: payday nearest the 15th
                  </option>
                ))
              : null}
            <option value="day">A fixed day</option>
          </Select>
        </Field>

        <Field label="Fixed split day" error={state.issues?.splitDay}>
          <TextInput
            type="number"
            name="splitDay"
            min={1}
            max={28}
            defaultValue={settings.splitDay}
            required
          />
        </Field>

        <Field label="Look ahead (days)" error={state.issues?.horizonDays}>
          <TextInput
            type="number"
            name="horizonDays"
            min={7}
            max={365}
            defaultValue={settings.horizonDays}
            required
          />
        </Field>

        {/* The floor is the checking cushion, set beside this form (one amount for the whole app). */}
        <input type="hidden" name="buffer" value={settings.buffer} />

        <Field label="Carry unpaid bills for" error={state.issues?.carryMonths}>
          <Select name="carryMonths" defaultValue={String(settings.carryMonths)}>
            <option value="0">Not at all</option>
            <option value="1">1 month</option>
            <option value="2">2 months</option>
            <option value="3">3 months</option>
            <option value="6">6 months</option>
            <option value="12">12 months</option>
          </Select>
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

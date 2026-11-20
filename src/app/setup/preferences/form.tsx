"use client";

import { useActionState } from "react";
import { savePreferencesAction, type FormState } from "../actions";
import { Button, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function PreferencesForm({
  bankAccounts,
  settings,
}: {
  bankAccounts: Array<{ id: string; name: string }>;
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
        <Field
          label="Bills account"
          hint="The balance the projection starts from"
          error={state.issues?.billsAccountId}
        >
          <Select name="billsAccountId" defaultValue={settings.billsAccountId ?? ""}>
            <option value="">—</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Divide the month at" hint="Which paycheck covers which bills">
          <Select name="splitMode" defaultValue={settings.splitMode ?? "payday"}>
            <option value="payday">My payday nearest the 15th</option>
            <option value="day">A fixed day (below)</option>
          </Select>
        </Field>

        <Field
          label="Fixed split day"
          hint="Used when there's no pay calendar, or when chosen above"
          error={state.issues?.splitDay}
        >
          <TextInput
            type="number"
            name="splitDay"
            min={1}
            max={28}
            defaultValue={settings.splitDay}
            required
          />
        </Field>

        <Field
          label="Projection horizon (days)"
          hint="Long enough to include next month's fixed bills"
          error={state.issues?.horizonDays}
        >
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

        <Field
          label="Carry unpaid bills forward for"
          hint="A bill older than this is treated as paid. Long gaps are usually a missed entry rather than money still owed."
          error={state.issues?.carryMonths}
        >
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

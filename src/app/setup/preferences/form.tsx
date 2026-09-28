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

        <Field
          label="Month splits on day"
          hint="A planning guideline, not a payday"
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

        <Field
          label="Keep a floor of"
          hint="Leave at 0 if you move money as needed"
          error={state.issues?.bufferCents}
        >
          <TextInput name="buffer" defaultValue={settings.buffer} inputMode="decimal" />
        </Field>

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

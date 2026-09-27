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

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

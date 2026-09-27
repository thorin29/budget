"use client";

import { useActionState } from "react";
import { addAccountAction, removeAccountAction, type FormState } from "../actions";
import { Button, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function AccountsForm({
  kinds,
  bankAccounts,
}: {
  kinds: Array<{ value: string; label: string }>;
  bankAccounts: Array<{ id: string; name: string }>;
}) {
  const [state, action, pending] = useActionState(addAccountAction, INITIAL);

  return (
    <Card>
      <ErrorBanner message={state.ok ? undefined : state.message} />
      <form action={action} className="grid gap-4 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
        <Field label="Name" error={state.issues?.name}>
          <TextInput name="name" required maxLength={80} placeholder="" autoComplete="off" />
        </Field>

        <Field label="Kind" error={state.issues?.kind}>
          <Select name="kind" defaultValue="BANK">
            {kinds.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          label="Settled by"
          hint="Cards only"
          error={state.issues?.settledById}
        >
          <Select name="settledById" defaultValue="">
            <option value="">—</option>
            {bankAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </Field>

        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
    </Card>
  );
}

export function AccountRow({
  account,
  kindLabel,
  settledByName,
}: {
  account: { id: string; name: string; kind: string; active: boolean };
  kindLabel: string;
  settledByName: string | null;
}) {
  const [, action, pending] = useActionState(removeAccountAction, INITIAL);

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3">
      <div className="min-w-0">
        <span className={account.active ? "" : "text-muted line-through"}>
          {account.name}
        </span>
        <span className="ml-2 text-xs text-muted">
          {kindLabel}
          {settledByName ? ` · settled by ${settledByName}` : ""}
          {account.active ? "" : " · inactive"}
        </span>
      </div>

      <form action={action}>
        <input type="hidden" name="id" value={account.id} />
        <Button type="submit" variant="danger" disabled={pending}>
          Remove
        </Button>
      </form>
    </div>
  );
}

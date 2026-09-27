"use client";

import { useActionState, useState } from "react";
import {
  addPayScheduleAction,
  removePayScheduleAction,
  type FormState,
} from "../actions";
import { Button, Card, ErrorBanner, Field, Select, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function PayScheduleForm({
  frequencies,
}: {
  frequencies: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(addPayScheduleAction, INITIAL);
  const [frequency, setFrequency] = useState("BIWEEKLY");

  const needsAnchor = frequency === "WEEKLY" || frequency === "BIWEEKLY";

  return (
    <Card>
      <ErrorBanner message={state.ok ? undefined : state.message} />
      <form action={action} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" hint="What this income is" error={state.issues?.name}>
          <TextInput name="name" required maxLength={60} autoComplete="off" />
        </Field>

        <Field label="Frequency" error={state.issues?.frequency}>
          <Select
            name="frequency"
            value={frequency}
            onChange={(e) => setFrequency(e.target.value)}
          >
            {frequencies.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </Select>
        </Field>

        {needsAnchor ? (
          <Field
            label="A recent payday"
            hint="Every other payday is counted from this one"
            error={state.issues?.anchorDate}
          >
            <TextInput type="date" name="anchorDate" required />
          </Field>
        ) : (
          <Field
            label="Days of the month"
            hint="Comma separated, e.g. 15, 30"
            error={state.issues?.daysOfMonth}
          >
            <TextInput name="daysOfMonth" placeholder="15, 30" autoComplete="off" />
          </Field>
        )}

        <Field
          label="In effect from"
          hint="Usually the start of the year this applies to"
          error={state.issues?.activeFrom}
        >
          <TextInput type="date" name="activeFrom" required />
        </Field>

        <div className="sm:col-span-2">
          <Button type="submit" disabled={pending}>
            {pending ? "Adding…" : "Add schedule"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

export function PayScheduleRow({
  schedule,
  frequencyLabel,
  upcoming,
}: {
  schedule: {
    id: string;
    name: string;
    activeFrom: string;
    activeTo: string | null;
    anchorDate: string | null;
    daysOfMonth: number[];
  };
  frequencyLabel: string;
  upcoming: string[];
}) {
  const [, action, pending] = useActionState(removePayScheduleAction, INITIAL);

  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <span className="font-medium">{schedule.name}</span>
          <span className="ml-2 text-xs text-muted">
            {frequencyLabel} · from {schedule.activeFrom}
            {schedule.activeTo ? ` to ${schedule.activeTo}` : ""}
          </span>
        </div>
        <form action={action}>
          <input type="hidden" name="id" value={schedule.id} />
          <Button type="submit" variant="danger" disabled={pending}>
            Remove
          </Button>
        </form>
      </div>

      {upcoming.length > 0 ? (
        <p className="tnum mt-2 text-xs text-muted">
          Next: {upcoming.join(" · ")}
        </p>
      ) : (
        <p className="mt-2 text-xs text-danger">
          This schedule produces no paydays — check the anchor date or days.
        </p>
      )}
    </div>
  );
}

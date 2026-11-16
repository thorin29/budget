"use client";

import { useActionState } from "react";
import { addCategoryAction, removeCategoryAction, setManagedAction, type FormState } from "../actions";
import { Button, Card, ErrorBanner, Field, TextInput } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function CategoryForm() {
  const [state, action, pending] = useActionState(addCategoryAction, INITIAL);

  return (
    <Card>
      <ErrorBanner message={state.ok ? undefined : state.message} />
      <form action={action} className="flex items-end gap-3">
        <div className="flex-1">
          <Field label="Name" error={state.issues?.name}>
            <TextInput name="name" required maxLength={60} autoComplete="off" />
          </Field>
        </div>
        <Button type="submit" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </Button>
      </form>
    </Card>
  );
}

export function CategoryRow({
  category,
}: {
  category: { id: string; name: string; active: boolean; managedForOthers?: boolean };
}) {
  const [, action, pending] = useActionState(removeCategoryAction, INITIAL);
  const [, manage, managing] = useActionState(setManagedAction, INITIAL);
  const managed = category.managedForOthers ?? false;

  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-line bg-surface px-4 py-3">
      <span className={category.active ? "" : "text-muted line-through"}>
        {category.name}
        {category.active ? "" : <span className="ml-2 text-xs">inactive</span>}
        {managed ? <span className="ml-2 text-xs font-semibold text-muted">· managed for others</span> : null}
      </span>
      <span className="flex shrink-0 items-center gap-2">
      <form action={manage}>
        <input type="hidden" name="id" value={category.id} />
        <input type="hidden" name="managed" value={managed ? "0" : "1"} />
        <Button type="submit" variant="quiet" disabled={managing} title="Money you hold or pass through for other people, like league fees. Kept out of spending and income.">
          {managed ? "Count as mine" : "Managed for others"}
        </Button>
      </form>
      <form action={action}>
        <input type="hidden" name="id" value={category.id} />
        <Button type="submit" variant="danger" disabled={pending}>
          Remove
        </Button>
      </form>
      </span>
    </div>
  );
}

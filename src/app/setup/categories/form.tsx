"use client";

import { useActionState } from "react";
import { addCategoryAction, removeCategoryAction, type FormState } from "../actions";
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
  category: { id: string; name: string; active: boolean };
}) {
  const [, action, pending] = useActionState(removeCategoryAction, INITIAL);

  return (
    <div className="flex items-center justify-between gap-4 rounded-md border border-line bg-surface px-4 py-3">
      <span className={category.active ? "" : "text-muted line-through"}>
        {category.name}
        {category.active ? "" : <span className="ml-2 text-xs">inactive</span>}
      </span>
      <form action={action}>
        <input type="hidden" name="id" value={category.id} />
        <Button type="submit" variant="danger" disabled={pending}>
          Remove
        </Button>
      </form>
    </div>
  );
}

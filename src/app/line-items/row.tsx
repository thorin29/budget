"use client";

import { useActionState, useState } from "react";
import { deleteLineItemAction, type FormState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: FormState = { ok: true };

/**
 * Lives inside the line item form and submits it to the delete action, which
 * reads the same hidden id. Asks twice: the first press only arms it and asks
 * where the bank charges matched to it should count instead.
 * Deletes for good, with its recorded payments and planned amounts.
 */
export function DeleteLineItem({ id, name, categories }: { id: string; name: string; categories: Array<{ id: string; name: string }> }) {
  const [state, action, pending] = useActionState(deleteLineItemAction, INITIAL);
  const [armed, setArmed] = useState(false);

  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonClass("danger")}>
        Remove
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted">
        Its charges count as
        <select name="chargesTo" defaultValue="" className="rounded-lg border border-line bg-surface px-2 py-1 text-sm text-foreground">
          <option value="">Their usual category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        formAction={action}
        formNoValidate
        disabled={pending}
        data-id={id}
        aria-label={`Confirm removing ${name}`}
        className={buttonClass("danger", "bg-danger-soft")}
      >
        {pending ? "Deleting…" : "Delete"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
        Keep
      </button>
      <span className="basis-full text-xs text-muted">Deletes it with its recorded payments and planned amounts. The bank charges stay. To keep the history, set Status to Inactive instead.</span>
      {state.ok ? null : <span className="text-xs text-danger">{state.message}</span>}
    </span>
  );
}

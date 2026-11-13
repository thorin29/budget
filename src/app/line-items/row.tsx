"use client";

import { useActionState, useState } from "react";
import { deleteLineItemAction, type FormState } from "./actions";
import { buttonClass } from "@/components/ui";

const INITIAL: FormState = { ok: true };

/**
 * Lives inside the line item form and submits it to the delete action, which
 * reads the same hidden id. Asks twice: the first press only arms it.
 * An item with history is retired (made inactive) rather than deleted.
 */
export function DeleteLineItem({ id, name }: { id: string; name: string }) {
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
    <span className="flex items-center gap-2">
      <button
        type="submit"
        formAction={action}
        formNoValidate
        disabled={pending}
        data-id={id}
        aria-label={`Confirm removing ${name}`}
        className={buttonClass("danger", "bg-danger-soft")}
      >
        {pending ? "Removing…" : "Yes, remove"}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
        Keep
      </button>
      {state.ok ? null : <span className="text-xs text-danger">{state.message}</span>}
    </span>
  );
}

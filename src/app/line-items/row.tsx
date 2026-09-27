"use client";

import { useActionState } from "react";
import { deleteLineItemAction, type FormState } from "./actions";
import { Button } from "@/components/ui";

const INITIAL: FormState = { ok: true };

export function DeleteLineItem({ id, name }: { id: string; name: string }) {
  const [, action, pending] = useActionState(deleteLineItemAction, INITIAL);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" disabled={pending} aria-label={`Remove ${name}`}>
        Remove
      </Button>
    </form>
  );
}

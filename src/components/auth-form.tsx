"use client";

import { startTransition, useActionState } from "react";
import type { AuthFormState } from "@/server/action-result";
import { ErrorBanner, Field, TextInput, buttonClass } from "@/components/ui";

const INITIAL: AuthFormState = { ok: true };

export interface AuthField {
  name: string;
  label: string;
  type?: "text" | "password";
  autoComplete: string;
  hint?: string;
  defaultValue?: string;
}

/**
 * The sign-in, first-account and join forms. On success the browser does a
 * full page load (not a client-side push), so the layout and the gate run
 * again with the new cookie.
 */
export function AuthForm({
  action,
  fields,
  submitLabel,
  hidden = {},
}: {
  action: (state: AuthFormState, form: FormData) => Promise<AuthFormState>;
  fields: AuthField[];
  submitLabel: string;
  hidden?: Record<string, string>;
}) {
  // Navigate from inside the submit itself, not from an effect on the result:
  // the new cookie swaps the root layout's frame, which remounts this form and
  // would drop the result before an effect could see it.
  const [state, submit, pending] = useActionState(async (previous: AuthFormState, form: FormData) => {
    const result = await action(previous, form);
    if (result.ok && result.redirect) window.location.assign(result.redirect);
    return result;
  }, INITIAL);

  const issues = state.ok ? undefined : state.issues;
  const message = state.ok ? undefined : issues ? undefined : state.message;

  return (
    <form
      // Submitted by hand rather than through the form's action prop, which
      // would clear every field after a failed attempt (the username included).
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        startTransition(() => submit(form));
      }}
      className="space-y-4"
    >
      {Object.entries(hidden).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <ErrorBanner message={message} />
      {fields.map((f, i) => (
        <Field key={f.name} label={f.label} hint={f.hint} error={issues?.[f.name]}>
          <TextInput
            name={f.name}
            type={f.type ?? "text"}
            autoComplete={f.autoComplete}
            defaultValue={f.defaultValue}
            autoFocus={i === 0}
            autoCapitalize="none"
            spellCheck={false}
            required
          />
        </Field>
      ))}
      <button type="submit" disabled={pending || (state.ok && !!state.redirect)} className={buttonClass("primary", "w-full py-2.5")}>
        {pending ? "One moment…" : submitLabel}
      </button>
    </form>
  );
}

/** The centred card the account pages sit in. */
export function AuthCard({ title, lead, children }: { title: string; lead?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-accent text-on-accent">
            <svg width="18" height="18" viewBox="0 0 48 48" fill="currentColor" aria-hidden>
              <rect x="10" y="12" width="20" height="6" rx="3" />
              <rect x="10" y="21" width="26" height="6" rx="3" opacity="0.75" />
              <rect x="10" y="30" width="16" height="6" rx="3" opacity="0.5" />
            </svg>
          </span>
          <span className="font-heading text-[17px] font-bold tracking-tight">Ledger</span>
        </div>
        <div className="rounded-2xl border border-line bg-surface p-6 shadow-card">
          <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
          {lead ? <div className="mt-1.5 text-sm text-muted">{lead}</div> : null}
          <div className="mt-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

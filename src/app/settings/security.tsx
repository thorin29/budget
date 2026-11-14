"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { AuthFormState } from "@/server/action-result";
import { Button, ErrorBanner, Field, TextInput, buttonClass } from "@/components/ui";
import { MIN_PASSWORD } from "@/lib/auth/rules";
import {
  changePasswordAction,
  createEnrollCodeAction,
  createInviteAction,
  removeUserAction,
  revokeDeviceAction,
  signOutEverywhereAction,
  type EnrollCodeState,
} from "./account-actions";

const INITIAL: AuthFormState = { ok: true };

export function ChangePasswordForm() {
  const [state, submit, pending] = useActionState(changePasswordAction, INITIAL);
  const [key, setKey] = useState(0);
  const issues = state.ok ? undefined : state.issues;

  // Clear the fields after a successful change.
  useEffect(() => {
    if (state.ok && state.message) setKey((k) => k + 1);
  }, [state]);

  return (
    <form action={submit} key={key} className="max-w-sm space-y-4">
      {state.ok && state.message ? (
        <p className="rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">{state.message}</p>
      ) : null}
      <ErrorBanner message={!state.ok && !issues ? state.message : undefined} />
      <Field label="Current password" error={issues?.current}>
        <TextInput name="current" type="password" autoComplete="current-password" required />
      </Field>
      <Field label="New password" hint={`At least ${MIN_PASSWORD} characters`} error={issues?.password}>
        <TextInput name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="New password again" error={issues?.confirm}>
        <TextInput name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

export function SignOutEverywhere() {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  if (!armed) {
    return (
      <Button type="button" variant="quiet" onClick={() => setArmed(true)}>
        Sign out everywhere
      </Button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="danger"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await signOutEverywhereAction();
            window.location.assign(result.ok && result.redirect ? result.redirect : "/sign-in");
          })
        }
      >
        {pending ? "Signing out…" : "Yes, sign out every browser and device"}
      </Button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
        Keep
      </button>
    </span>
  );
}

export function InviteSecondPerson() {
  const [result, setResult] = useState<AuthFormState | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok && result.code) {
    const until = result.expiresAt
      ? new Date(result.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "";
    return (
      <div className="rounded-xl border border-line bg-sunken p-4">
        <p className="text-sm">Give them this code. It works once, until {until}.</p>
        <p className="tnum mt-2 select-all font-mono text-xl font-bold tracking-wider">{result.code}</p>
        <p className="mt-2 text-xs text-muted">
          They open this site, choose &ldquo;Create your account&rdquo; under the sign-in form, and enter it with a
          username and password of their own. It is shown only now.
        </p>
      </div>
    );
  }

  return (
    <div>
      {result && !result.ok ? <ErrorBanner message={result.message} /> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await createInviteAction()))}
        className={buttonClass("quiet")}
      >
        {pending ? "Creating…" : "Create a one-time code"}
      </button>
    </div>
  );
}

export function RemoveUser({ userId, username }: { userId: string; username: string }) {
  const [state, submit, pending] = useActionState(removeUserAction, INITIAL);
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonClass("danger")}>
        Remove
      </button>
    );
  }
  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="userId" value={userId} />
      <button type="submit" disabled={pending} className={buttonClass("danger", "bg-danger-soft")}>
        {pending ? "Removing…" : `Yes, remove ${username}`}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
        Keep
      </button>
      {!state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

export function AddPhone() {
  const [result, setResult] = useState<EnrollCodeState | null>(null);
  const [pending, start] = useTransition();

  if (result?.ok) {
    const until = new Date(result.expiresAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    return (
      <div className="flex flex-wrap items-start gap-5 rounded-xl border border-line bg-sunken p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={result.qr} alt="QR code for adding a phone" width={148} height={148} className="rounded-lg bg-white p-1.5" />
        <div className="min-w-0 flex-1">
          <p className="text-sm">In the phone app, scan the code or type this, with your password. It works once, until {until}.</p>
          <p className="tnum mt-2 select-all font-mono text-2xl font-bold tracking-widest">{result.code}</p>
          <p className="mt-2 text-xs text-muted">Shown only now. Make a new one if it runs out.</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      {result && !result.ok ? <ErrorBanner message={result.message} /> : null}
      <button
        type="button"
        disabled={pending}
        onClick={() => start(async () => setResult(await createEnrollCodeAction()))}
        className={buttonClass("quiet")}
      >
        {pending ? "Creating…" : "Add a phone"}
      </button>
    </div>
  );
}

export function RevokeDevice({ deviceId, name }: { deviceId: string; name: string }) {
  const [state, submit, pending] = useActionState(revokeDeviceAction, INITIAL);
  const [armed, setArmed] = useState(false);
  if (!armed) {
    return (
      <button type="button" onClick={() => setArmed(true)} className={buttonClass("danger")}>
        Sign out phone
      </button>
    );
  }
  return (
    <form action={submit} className="flex items-center gap-2">
      <input type="hidden" name="deviceId" value={deviceId} />
      <button type="submit" disabled={pending} className={buttonClass("danger", "bg-danger-soft")}>
        {pending ? "Signing out…" : `Yes, sign out ${name}`}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
        Keep
      </button>
      {!state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
    </form>
  );
}

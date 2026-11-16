"use client";

import { useActionState, useRef, useState, useTransition } from "react";
import { Button, ErrorBanner, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import {
  connectBankAction,
  deleteBankDataAction,
  disconnectBankAction,
  importCsvAction,
  previewCsvAction,
  revertCsvAction,
  setBankAccountAction,
  syncBankAction,
  type BankActionState,
} from "./bank-actions";
import type { CsvPreview } from "@/server/bank/csv-import";

const INITIAL: BankActionState = { ok: true };

function Notice({ state }: { state: BankActionState | null }) {
  if (!state) return null;
  if (!state.ok) return <ErrorBanner message={state.message} />;
  return state.message ? <p className="mb-4 rounded-xl bg-ok-soft px-3.5 py-2.5 text-sm text-ok">{state.message}</p> : null;
}

export function ConnectBank() {
  const [state, submit, pending] = useActionState(connectBankAction, INITIAL);
  return (
    <form action={submit} className="space-y-3">
      <Notice state={state} />
      <label className="block text-[13px] font-semibold" htmlFor="token">
        Setup token
      </label>
      <textarea
        id="token"
        name="token"
        rows={3}
        required
        autoComplete="off"
        spellCheck={false}
        className="w-full rounded-[10px] border border-line-strong bg-field px-3 py-2 font-mono text-xs text-foreground outline-none focus:border-accent focus:ring-3 focus:ring-accent/20"
        placeholder="Paste the token your bridge created for this app"
      />
      <p className="text-xs text-muted">
        The token works once. Budget trades it for a private access link, stores that link encrypted, and forgets the token.
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Connecting… this can take a minute" : "Connect"}
      </Button>
    </form>
  );
}

function Armed({
  label,
  confirm,
  action,
  danger = false,
}: {
  label: string;
  confirm: string;
  action: () => Promise<BankActionState>;
  danger?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const [state, setState] = useState<BankActionState | null>(null);
  return (
    <span className="inline-flex flex-col gap-2">
      {state && !state.ok ? <ErrorBanner message={state.message} /> : null}
      {!armed ? (
        <Button type="button" variant={danger ? "danger" : "quiet"} onClick={() => setArmed(true)}>
          {label}
        </Button>
      ) : (
        <span className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="danger"
            disabled={pending}
            onClick={() => start(async () => setState(await action()))}
          >
            {pending ? "Working…" : confirm}
          </Button>
          <button type="button" onClick={() => setArmed(false)} className="text-sm text-muted hover:text-foreground">
            Cancel
          </button>
        </span>
      )}
    </span>
  );
}

export function SyncControls() {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BankActionState | null>(null);
  return (
    <div>
      <Notice state={state} />
      <div className="flex flex-wrap items-start gap-2">
        <Button type="button" disabled={pending} onClick={() => start(async () => setState(await syncBankAction()))}>
          {pending ? "Syncing… this can take a minute" : "Sync now"}
        </Button>
        <Armed label="Disconnect" confirm="Yes, disconnect" action={disconnectBankAction} />
      </div>
    </div>
  );
}

export function DeleteBankData() {
  return <Armed label="Delete all bank data" confirm="Yes, delete every account and transaction" action={deleteBankDataAction} danger />;
}

const USE_OPTIONS = [
  { value: "", label: "Choose…" },
  { value: "SPENDING", label: "Spending" },
  { value: "BALANCE_ONLY", label: "Balance only" },
  { value: "HIDDEN", label: "Hidden" },
];

export function AccountChoice({
  id,
  use,
  linkedAccountId,
  budgetAccounts,
}: {
  id: string;
  use: string | null;
  linkedAccountId: string | null;
  budgetAccounts: Array<{ id: string; name: string }>;
}) {
  const form = useRef<HTMLFormElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const save = () =>
    start(async () => {
      if (!form.current) return;
      const result = await setBankAccountAction(new FormData(form.current));
      setError(result.ok ? null : result.message);
    });

  return (
    <form ref={form} className="flex flex-wrap items-center gap-2" onSubmit={(e) => e.preventDefault()}>
      <input type="hidden" name="id" value={id} />
      <div className="w-36">
        <Select name="use" defaultValue={use ?? ""} onChange={save} disabled={pending} aria-label="How this account is used">
          {USE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
      {budgetAccounts.length ? (
        <div className="w-56">
          <Select
            name="linkedAccountId"
            defaultValue={linkedAccountId ?? ""}
            onChange={save}
            disabled={pending}
            aria-label="Keep a Budget account's balance current"
          >
            <option value="">No balance link</option>
            {budgetAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                Keeps “{a.name}” current
              </option>
            ))}
          </Select>
        </div>
      ) : null}
      {pending ? <span className="text-xs text-muted">Saving…</span> : null}
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </form>
  );
}

export function CsvImporter({ accounts }: { accounts: Array<{ id: string; label: string }> }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [flip, setFlip] = useState(false);
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [message, setMessage] = useState<BankActionState | null>(null);
  const [pending, start] = useTransition();

  const reset = () => {
    setPreview(null);
    setMessage(null);
  };
  const runPreview = (text = file?.text, nextFlip = flip, id = accountId) =>
    start(async () => {
      if (!text || !id) return;
      const result = await previewCsvAction(id, text, nextFlip);
      if (result.ok) {
        setPreview(result.data);
        setMessage(null);
      } else {
        setPreview(null);
        setMessage(result);
      }
    });

  return (
    <div className="space-y-4">
      <Notice state={message} />
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-[13px] font-semibold">
          Into account
          <Select
            className="mt-1"
            value={accountId}
            onChange={(e) => {
              setAccountId(e.target.value);
              reset();
            }}
          >
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </Select>
        </label>
        <label className="block text-[13px] font-semibold">
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-[10px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground"
            onChange={async (e) => {
              reset();
              const chosen = e.target.files?.[0];
              if (!chosen) return setFile(null);
              if (chosen.size > 5 * 1024 * 1024) {
                setFile(null);
                return setMessage({ ok: false, message: "The file is larger than 5 MB" });
              }
              const text = await chosen.text();
              setFile({ name: chosen.name, text });
              runPreview(text);
            }}
          />
        </label>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={flip}
          onChange={(e) => {
            setFlip(e.target.checked);
            runPreview(undefined, e.target.checked);
          }}
        />
        Flip signs (use if purchases show up as money in)
      </label>

      {pending && !preview ? <p className="text-sm text-muted">Reading…</p> : null}
      {preview ? (
        <div className="rounded-xl border border-line p-4 text-sm">
          <p>
            <strong>{preview.total}</strong> transactions from {preview.from} to {preview.to} ({preview.layout}).{" "}
            {preview.duplicates ? `${preview.duplicates} are already in this account and will be skipped.` : "None are already in this account."}
          </p>
          <p className="mt-1 text-muted">
            Money out {formatCents(preview.outCents)} · money in {formatCents(preview.inCents)}
          </p>
          <ul className="mt-3 divide-y divide-line rounded-lg border border-line">
            {preview.sample.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{r.merchant}</span>
                  <span className="block truncate text-xs text-muted">
                    {r.postedOn} · {r.description}
                    {r.duplicate ? " · already here" : ""}
                  </span>
                </span>
                <span className={`tnum shrink-0 font-semibold ${r.amountCents < 0 ? "" : "text-ok"}`}>{formatCents(r.amountCents)}</span>
              </li>
            ))}
          </ul>
          {preview.problems.length ? (
            <p className="mt-2 text-xs text-muted">Skipped rows: {preview.problems.slice(0, 3).join("; ")}</p>
          ) : null}
          <div className="mt-4">
            <Button
              type="button"
              disabled={pending || preview.total === preview.duplicates}
              onClick={() =>
                start(async () => {
                  if (!file) return;
                  const result = await importCsvAction(accountId, file.text, flip, file.name);
                  setPreview(null);
                  setMessage(
                    result.ok
                      ? { ok: true, message: `Imported ${result.data.added} transactions; skipped ${result.data.skipped} already here.` }
                      : result,
                  );
                })
              }
            >
              {pending ? "Importing…" : `Import ${preview.total - preview.duplicates} transactions`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function RevertImport({ importId }: { importId: string }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BankActionState | null>(null);
  if (state?.ok) return <span className="text-xs text-muted">{state.message}</span>;
  return (
    <span className="flex items-center gap-2">
      {state && !state.ok ? <span className="text-xs text-danger">{state.message}</span> : null}
      <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => setState(await revertCsvAction(importId)))}>
        {pending ? "Undoing…" : "Undo"}
      </Button>
    </span>
  );
}

"use client";

import { useActionState, useState, useTransition } from "react";
import { Button, ErrorBanner, Select } from "@/components/ui";
import { formatCents } from "@/lib/money";
import { CARD_COLORS, cardColor, isCustomColor } from "@/lib/card-colors";
import {
  connectBankAction,
  deleteBankDataAction,
  disconnectBankAction,
  importCsvAction,
  importCombinedAction,
  previewCombinedAction,
  previewCsvAction,
  revertCsvAction,
  setAccountHiddenAction,
  setAccountTypeAction,
  setBillsSourceAction,
  setCardTermsAction,
  connectAccountAction,
  syncBankAction,
  type BankActionState,
} from "./bank-actions";
import type { CombinedPart, CsvPreview } from "@/server/bank/csv-import";

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

export function AccountTypeSelect({ id, type, options }: { id: string; type: string; options: Array<{ value: string; label: string }> }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex items-center gap-2">
      <span className="w-36">
        <Select
          defaultValue={type}
          disabled={pending}
          aria-label="Account type"
          onChange={(e) =>
            start(async () => {
              const result = await setAccountTypeAction(id, e.target.value);
              setError(result.ok ? null : result.message);
            })
          }
        >
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </span>
      {error ? <span className="text-xs text-danger">{error}</span> : null}
    </span>
  );
}

export function HideAccount({ id, hidden }: { id: string; hidden: boolean }) {
  const [pending, start] = useTransition();
  return (
    <Button type="button" variant="ghost" disabled={pending} onClick={() => start(async () => void (await setAccountHiddenAction(id, !hidden)))}>
      {pending ? "…" : hidden ? "Show" : "Hide"}
    </Button>
  );
}

export function BillsSource({ current, options }: { current: string; options: Array<{ id: string; label: string }> }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BankActionState | null>(null);
  return (
    <div className="space-y-3">
      <Notice state={state} />
      <div className="max-w-md">
        <Select
          defaultValue={current}
          disabled={pending}
          aria-label="Where the bills balance comes from"
          onChange={(e) => start(async () => setState(await setBillsSourceAction(e.target.value)))}
        >
          <option value="">I&rsquo;ll type it by hand</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>
    </div>
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

/** Which bank feed account an account typed by hand is. */
export function LinkAccountToBank({ accountId, current, options }: { accountId: string; current: string; options: Array<{ id: string; label: string }> }) {
  const [pending, start] = useTransition();
  const [state, setState] = useState<BankActionState | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <Select
        defaultValue={current}
        disabled={pending}
        aria-label="Bank account"
        className="max-w-64 text-sm"
        onChange={(e) => start(async () => setState(await connectAccountAction(accountId, e.target.value)))}
      >
        <option value="">Not connected</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </Select>
      {state ? <span className={`text-xs ${state.ok ? "text-muted" : "text-danger"}`}>{state.message}</span> : null}
    </span>
  );
}

/** One history file carrying several accounts' rows, each tagged with its account. */
export function CombinedImporter() {
  const [file, setFile] = useState<{ name: string; text: string } | null>(null);
  const [parts, setParts] = useState<CombinedPart[] | null>(null);
  const [message, setMessage] = useState<BankActionState | null>(null);
  const [pending, start] = useTransition();
  // A part counts when it brings new rows or categories; a file of rows already here can still set categories.
  const ready = parts?.filter((p) => p.accountId && (p.total > p.duplicates || p.labeled > 0)) ?? [];
  const newRows = ready.reduce((s, p) => s + p.total - p.duplicates, 0);
  const labeled = ready.reduce((s, p) => s + p.labeled, 0);

  return (
    <div className="space-y-4">
      <Notice state={message} />
      <label className="block text-[13px] font-semibold">
        Combined CSV file
        <input
          type="file"
          accept=".csv,text/csv"
          className="mt-1 block w-full text-sm text-muted file:mr-3 file:rounded-[10px] file:border file:border-line-strong file:bg-surface file:px-3 file:py-1.5 file:text-sm file:font-semibold file:text-foreground"
          onChange={async (e) => {
            setParts(null);
            setMessage(null);
            const chosen = e.target.files?.[0];
            if (!chosen) return setFile(null);
            if (chosen.size > 5 * 1024 * 1024) return setMessage({ ok: false, message: "The file is larger than 5 MB" });
            const text = await chosen.text();
            setFile({ name: chosen.name, text });
            start(async () => {
              const r = await previewCombinedAction(text);
              if (r.ok) setParts(r.data);
              else setMessage(r);
            });
          }}
        />
      </label>
      {pending && !parts ? <p className="text-sm text-muted">Reading…</p> : null}
      {parts ? (
        <div className="rounded-xl border border-line p-4 text-sm">
          <ul className="divide-y divide-line">
            {parts.map((p) => (
              <li key={p.key} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="font-medium">{p.label}</span>
                <span className="text-xs text-muted">
                  {!p.accountId
                    ? "No matching account; these rows will be left out"
                    : `${p.total} rows, ${p.from} to ${p.to}${p.duplicates ? ` · ${p.duplicates} already here` : ""}${p.labeled ? ` · ${p.labeled} with categories` : ""}`}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <Button
              type="button"
              disabled={pending || !ready.length}
              onClick={() =>
                start(async () => {
                  if (!file) return;
                  const r = await importCombinedAction(file.text, file.name);
                  setParts(null);
                  setMessage(
                    r.ok
                      ? {
                          ok: true,
                          message: `Imported ${r.data.added} transactions into ${r.data.accounts} accounts; skipped ${r.data.skipped} already here.${r.data.categorized ? ` Set ${r.data.categorized} categories from the file.` : ""}${r.data.unmatched.length ? ` Left out: ${r.data.unmatched.join(", ")}.` : ""}`,
                        }
                      : r,
                  );
                })
              }
            >
              {pending
                ? "Importing…"
                : newRows === 0 && labeled > 0
                  ? `Set ${labeled.toLocaleString()} categories`
                  : `Import into ${ready.length} account${ready.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A card's two statement days and an optional 0% end date, saved together. The
 * button answers in place: solid green as it saves, easing to a light green
 * "Saved", and back to "Save" once anything changes.
 */
export function CardTerms({
  id,
  closeDay,
  dueDay,
  promoEndsOn,
  color,
  nickname,
  feedName,
}: {
  id: string;
  closeDay: number | null;
  dueDay: number | null;
  promoEndsOn: string | null;
  color?: string | null;
  nickname?: string | null;
  feedName?: string;
}) {
  const [pending, start] = useTransition();
  const [preset, setPreset] = useState(isCustomColor(color) ? "custom" : color ?? "");
  const [custom, setCustom] = useState(color && isCustomColor(color) ? color : "#14563c");
  const chosen = preset === "custom" ? custom : preset;
  const [look, setLook] = useState<"idle" | "flash" | "saved">("idle");
  const [error, setError] = useState<string | null>(null);
  const reset = () => {
    setLook("idle");
    setError(null);
  };
  const tone =
    look === "flash"
      ? "border-ok bg-ok text-surface"
      : look === "saved"
        ? "border-ok-soft bg-ok-soft text-ok"
        : "border-line-strong bg-surface text-foreground hover:bg-neutral-soft";
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-xs"
      onChange={reset}
      action={(form) =>
        start(async () => {
          const r = await setCardTermsAction(id, String(form.get("closeDay") ?? ""), String(form.get("dueDay") ?? ""), String(form.get("promoEndsOn") ?? ""), chosen, String(form.get("nickname") ?? ""));
          if (!r.ok) {
            setLook("idle");
            setError(r.message);
            return;
          }
          setLook("flash");
          setTimeout(() => setLook((now) => (now === "flash" ? "saved" : now)), 350);
        })
      }
    >
      <label className="flex flex-col gap-1">
        <span className="text-muted">Name</span>
        <input name="nickname" maxLength={60} defaultValue={nickname ?? ""} placeholder={feedName ?? "As the bank names it"} className="w-44 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Closes on day</span>
        <input name="closeDay" type="number" min={1} max={31} defaultValue={closeDay ?? ""} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Due on day</span>
        <input name="dueDay" type="number" min={1} max={31} defaultValue={dueDay ?? ""} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">0% offer ends</span>
        <input name="promoEndsOn" type="date" defaultValue={promoEndsOn ?? ""} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-muted">Card color</span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-6 w-9 shrink-0 rounded-md border border-line" style={{ background: cardColor(chosen).background }} />
          <select name="color" value={preset} onChange={(e) => setPreset(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
            <option value="">Graphite</option>
            {CARD_COLORS.filter((c) => c.id !== "graphite").map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
            <option value="custom">Pick exactly…</option>
          </select>
          {preset === "custom" ? (
            <input
              type="color"
              aria-label="Card color"
              value={custom}
              onChange={(e) => {
                setCustom(e.target.value);
                reset();
              }}
              className="h-8 w-10 cursor-pointer rounded-md border border-line bg-surface p-0.5"
            />
          ) : null}
        </span>
      </label>
      <button
        type="submit"
        disabled={pending}
        aria-live="polite"
        className={`inline-flex min-w-20 items-center justify-center gap-1 rounded-[10px] border px-3.5 py-2 text-sm font-semibold transition-colors duration-700 ease-out disabled:opacity-70 ${tone}`}
      >
        {pending ? "Saving…" : look === "idle" ? "Save" : "Saved ✓"}
      </button>
      {error ? <span className="text-danger">{error}</span> : null}
    </form>
  );
}

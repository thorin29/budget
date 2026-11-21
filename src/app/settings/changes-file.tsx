"use client";

/** Data Imports & Exports › Changes file: pick the file, check every step, pick where the open ones go, apply. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { applyChangesAction, previewChangesAction } from "./changes-actions";
import type { ChangeStep } from "@/server/changes-file";

export function ChangesFile() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [text, setText] = useState<string | null>(null);
  const [steps, setSteps] = useState<ChangeStep[] | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = (file: File | undefined) => {
    if (!file) return;
    setMessage(null);
    setSteps(null);
    start(async () => {
      const body = await file.text();
      const r = await previewChangesAction(body);
      if (!r.ok) return setMessage({ ok: false, text: r.message });
      setText(body);
      setSteps(r.steps);
      setNote(r.note);
      setPicks({});
    });
  };
  const apply = () =>
    text &&
    start(async () => {
      const r = await applyChangesAction(text, picks);
      if (!r.ok) return setMessage({ ok: false, text: r.message });
      setMessage({ ok: r.skipped.length === 0, text: `Applied ${r.applied}.${r.skipped.length ? ` Skipped ${r.skipped.length}: ${r.skipped.slice(0, 5).map((s) => `#${s.n + 1} ${s.problem}`).join("; ")}` : ""}` });
      setSteps(null);
      setText(null);
      router.refresh();
    });

  const problems = steps?.filter((s) => s.problem).length ?? 0;
  const choices = steps?.filter((s) => s.choice) ?? [];
  const picked = choices.filter((s) => picks[s.choice!.transactionId]).length;

  return (
    <div className="space-y-3">
      <label className="inline-flex cursor-pointer items-center gap-2 rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold hover:bg-neutral-soft">
        Choose changes file
        <input type="file" accept=".json,application/json" className="sr-only" disabled={pending} onChange={(e) => load(e.target.files?.[0])} />
      </label>
      {pending ? <span className="ml-3 text-xs text-muted">Working…</span> : null}
      {message ? <p className={`text-sm ${message.ok ? "text-ok" : "text-danger"}`}>{message.text}</p> : null}
      {steps ? (
        <div className="space-y-3">
          {note ? <p className="text-sm text-muted">{note}</p> : null}
          <p className="text-sm">
            <b>{steps.length} steps</b>
            {problems ? <span className="text-danger"> · {problems} can&rsquo;t be done and will be skipped</span> : null}
            {choices.length ? <span className="text-muted"> · {picked} of {choices.length} picked</span> : null}
          </p>
          <ol className="max-h-[28rem] divide-y divide-line overflow-y-auto rounded-xl border border-line text-sm">
            {steps.map((s) => (
              <li key={s.n} className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 ${s.problem ? "bg-danger-soft" : ""}`}>
                <span className="min-w-0">
                  <span className="tnum mr-2 text-xs text-muted">{s.n + 1}</span>
                  {s.text}
                  {s.problem ? <span className="ml-2 text-xs font-semibold text-danger">{s.problem}</span> : null}
                </span>
                {s.choice ? (
                  <select
                    aria-label={`Category for step ${s.n + 1}`}
                    value={picks[s.choice.transactionId] ?? ""}
                    onChange={(e) => setPicks((p) => ({ ...p, [s.choice!.transactionId]: e.target.value }))}
                    className="rounded-lg border border-line bg-surface px-2 py-1 text-sm"
                  >
                    <option value="">Leave as is</option>
                    {s.choice.options.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : null}
              </li>
            ))}
          </ol>
          <div className="flex items-center gap-3">
            <button type="button" disabled={pending} onClick={apply} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60">
              Apply {steps.length - problems} steps
            </button>
            <button type="button" disabled={pending} onClick={() => (setSteps(null), setText(null))} className="text-sm font-semibold text-muted hover:underline">
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

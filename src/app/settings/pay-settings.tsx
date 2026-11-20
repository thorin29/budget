"use client";

/**
 * Pay Settings pieces: an employer's pay schedule (its paychecks, ending it when you leave) and how
 * the Tracker divides each month.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { endPayScheduleAction, linkPaycheckAction, removePayScheduleAction, reopenPayScheduleAction, savePeriodsAction, type FormState } from "../setup/actions";

type Ref = { id: string; name: string };

function useRun() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [note, setNote] = useState<FormState | null>(null);
  const run = (work: () => Promise<FormState>, ok = "Saved.") =>
    start(async () => {
      const r = await work();
      setNote(r.ok ? { ok: true, message: ok } : r);
      if (r.ok) router.refresh();
    });
  return { pending, note, run };
}

const SMALL = "rounded-lg border border-line px-2.5 py-1 text-xs font-semibold hover:bg-neutral-soft disabled:opacity-60";

export function ScheduleCard({
  schedule,
  frequencyLabel,
  upcoming,
  paychecks,
  unlinked,
}: {
  schedule: { id: string; name: string; activeFrom: string; activeTo: string | null };
  frequencyLabel: string;
  upcoming: string[];
  paychecks: Ref[];
  unlinked: Ref[];
}) {
  const { pending, note, run } = useRun();
  const [ending, setEnding] = useState(false);
  const [endOn, setEndOn] = useState(new Date().toISOString().slice(0, 10));
  const ended = !!schedule.activeTo;
  return (
    <div className={`rounded-xl border border-line px-4 py-3 ${ended ? "bg-neutral-soft" : "bg-surface"}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span>
          <span className="font-semibold">{schedule.name}</span>
          <span className="ml-2 text-xs text-muted">
            {frequencyLabel} · {schedule.activeFrom} – {schedule.activeTo ?? "now"}
          </span>
        </span>
        <span className="flex items-center gap-2">
          {ended ? (
            <button type="button" disabled={pending} className={SMALL} onClick={() => run(() => reopenPayScheduleAction(schedule.id), "Reopened.")}>
              Reopen
            </button>
          ) : (
            <button type="button" disabled={pending} className={SMALL} onClick={() => setEnding((v) => !v)}>
              End…
            </button>
          )}
          <button
            type="button"
            disabled={pending}
            className="text-xs font-semibold text-danger hover:underline"
            onClick={() => {
              const f = new FormData();
              f.set("id", schedule.id);
              run(() => removePayScheduleAction({ ok: true }, f), "Removed.");
            }}
          >
            Remove
          </button>
        </span>
      </div>
      {ending && !ended ? (
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted">Last payday on or before</span>
          <input type="date" value={endOn} onChange={(e) => setEndOn(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm" />
          <button type="button" disabled={pending} className={SMALL} onClick={() => run(() => endPayScheduleAction(schedule.id, endOn), "Ended. Past paydays are kept.")}>
            End schedule
          </button>
        </div>
      ) : null}
      {!ended && upcoming.length ? <p className="tnum mt-1.5 text-xs text-muted">Next: {upcoming.join(" · ")}</p> : null}
      {!ended && !upcoming.length ? <p className="mt-1.5 text-xs text-danger">No paydays: check the payday or days.</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted">Paychecks:</span>
        {paychecks.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-1 rounded-full border border-line bg-neutral-soft px-2 py-0.5">
            {p.name}
            {!ended ? (
              <button type="button" aria-label={`Take ${p.name} off this schedule`} disabled={pending} className="text-muted hover:text-danger" onClick={() => run(() => linkPaycheckAction(p.id, null))}>
                ✕
              </button>
            ) : null}
          </span>
        ))}
        {!ended && unlinked.length ? (
          <select aria-label="Link a paycheck" value="" disabled={pending} onChange={(e) => e.target.value && run(() => linkPaycheckAction(e.target.value, schedule.id), "Linked.")} className="rounded-full border border-dashed border-line bg-surface px-2 py-0.5 font-semibold text-accent-text">
            <option value="">+ Link a paycheck</option>
            {unlinked.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        ) : null}
        {!paychecks.length && !unlinked.length ? <span className="text-muted">none</span> : null}
      </div>
      {note ? <p className={`mt-1 text-xs ${note.ok ? "text-ok" : "text-danger"}`}>{note.message}</p> : null}
    </div>
  );
}

/** How the Tracker divides a month: one period, halves at a payday, or halves at a fixed day. */
export function PeriodsForm({ mode, splitDay, scheduleId, schedules }: { mode: "payday" | "day" | "none"; splitDay: number; scheduleId: string | null; schedules: Ref[] }) {
  const { pending, note, run } = useRun();
  const [m, setM] = useState(mode);
  const [day, setDay] = useState(String(splitDay));
  const [sched, setSched] = useState(scheduleId ?? "");
  const option = (value: typeof m, label: string, extra?: React.ReactNode) => (
    <label className={`flex flex-wrap items-center gap-2 rounded-xl border px-3 py-2.5 text-sm ${m === value ? "border-accent bg-accent-soft" : "border-line"}`}>
      <input type="radio" name="periods" checked={m === value} onChange={() => setM(value)} />
      <span className="font-semibold">{label}</span>
      {m === value ? extra : null}
    </label>
  );
  return (
    <div className="space-y-2">
      {option("none", "Whole month (no split)")}
      {option(
        "payday",
        "Two halves at the payday nearest the 15th",
        schedules.length > 1 ? (
          <select aria-label="Which schedule" value={sched} onChange={(e) => setSched(e.target.value)} className="rounded-lg border border-line bg-surface px-2 py-1 text-sm">
            <option value="">Main paycheck</option>
            {schedules.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        ) : null,
      )}
      {option(
        "day",
        "Two halves on a fixed day",
        <input type="number" min={1} max={28} aria-label="Split day" value={day} onChange={(e) => setDay(e.target.value)} className="w-20 rounded-lg border border-line bg-surface px-2 py-1 text-sm" />,
      )}
      <div className="flex items-center gap-3 pt-1">
        <button type="button" disabled={pending} className="rounded-lg bg-accent px-4 py-1.5 text-sm font-semibold text-on-accent disabled:opacity-60" onClick={() => run(() => savePeriodsAction(m, Number(day) || splitDay, sched || null))}>
          Save
        </button>
        {note ? <span className={`text-xs ${note.ok ? "text-ok" : "text-danger"}`}>{note.message}</span> : null}
      </div>
    </div>
  );
}

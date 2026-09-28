"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorBanner, Select } from "@/components/ui";
import type { ImportBatchSummary, ImportPlan } from "@/server/import";

type AccountKind = "BANK" | "CREDIT_CARD" | "CASH" | "OTHER";
type ItemKind = "BILL" | "SETTLEMENT" | "INCOME";

const KIND_LABELS: Record<ItemKind, string> = {
  BILL: "Bill",
  SETTLEMENT: "Card settlement",
  INCOME: "Income",
};

export function Importer({ batches }: { batches: ImportBatchSummary[] }) {
  const router = useRouter();
  const [document, setDocument] = useState<unknown>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [kinds, setKinds] = useState<Record<string, ItemKind>>({});
  const [accountKinds, setAccountKinds] = useState<Record<string, AccountKind>>({});
  const [updateExisting, setUpdateExisting] = useState(false);
  const [confineToYear, setConfineToYear] = useState(true);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string>();

  const choices = () => ({
    includeKeys: (plan?.lineItems ?? [])
      .map((i) => i.key)
      .filter((key) => !excluded.has(key)),
    kinds,
    accountKinds,
    updateExisting,
    confineToYear,
  });

  async function post(action: string, extra: Record<string, unknown> = {}) {
    const response = await fetch("/api/v1/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, document, choices: choices(), ...extra }),
    });
    const body = await response.json();
    if (!response.ok) {
      throw new Error(
        body?.error?.issues
          ? Object.values(body.error.issues).flat().join(". ")
          : (body?.error?.message ?? "Request failed"),
      );
    }
    return body;
  }

  async function onFile(file: File) {
    setError(undefined);
    setDone(undefined);
    setBusy(true);
    try {
      const parsed = JSON.parse(await file.text());
      setDocument(parsed);

      const response = await fetch("/api/v1/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "preview", document: parsed }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(
          body?.error?.issues
            ? Object.values(body.error.issues).flat().join(". ")
            : (body?.error?.message ?? "Could not read that file"),
        );
      }

      setPlan(body as ImportPlan);
      setKinds(
        Object.fromEntries(
          (body as ImportPlan).lineItems.map((i) => [i.key, i.kind as ItemKind]),
        ),
      );
      setAccountKinds(
        Object.fromEntries(
          (body as ImportPlan).accounts.map((a) => [a.key, a.kind as AccountKind]),
        ),
      );
      setExcluded(new Set());
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not read that file");
      setPlan(null);
    } finally {
      setBusy(false);
    }
  }

  async function refreshPlan() {
    if (!document) return;
    try {
      setPlan((await post("preview")) as ImportPlan);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed");
    }
  }

  async function apply() {
    setBusy(true);
    setError(undefined);
    try {
      const result = await post("apply");
      setDone(
        `Imported ${result.created.lineItems} new line items, ` +
          `${result.written.actuals} actuals and ${result.written.overrides} month adjustments.`,
      );
      setPlan(null);
      setDocument(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  async function revert(batchId: string) {
    setBusy(true);
    try {
      await post("revert", { batchId, document: undefined });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not revert");
    } finally {
      setBusy(false);
    }
  }

  const includedCount = (plan?.lineItems.length ?? 0) - excluded.size;

  return (
    <div>
      <ErrorBanner message={error} />
      {done ? (
        <div className="mb-4 rounded-md border border-accent/40 bg-accent-soft px-3 py-2 text-sm">
          {done}
        </div>
      ) : null}

      {!plan ? (
        <Card>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Import document</span>
            <input
              type="file"
              accept="application/json,.json"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void onFile(file);
              }}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-field file:px-3 file:py-1.5 file:text-sm"
            />
            <span className="mt-2 block text-xs text-muted">
              A JSON file converted from a workbook. Reading it writes nothing.
            </span>
          </label>
        </Card>
      ) : (
        <div className="space-y-6">
          <Card>
            <p className="text-sm">
              <span className="font-medium">{plan.sourceLabel}</span> — {includedCount} of{" "}
              {plan.lineItems.length} line items selected, {plan.totals.actuals} actuals,{" "}
              {plan.totals.overrides} month adjustments.
            </p>
            {plan.payDateCount > 0 ? (
              <p className="mt-1 text-xs text-muted">
                {plan.payDateCount} pay dates found. These are not imported — set up a
                pay calendar instead, which generates them from one date.
              </p>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-sm font-medium">How to treat this year</h2>

            <label className="mt-3 flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={confineToYear}
                onChange={(e) => setConfineToYear(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Confine new line items to {plan.year}
                <span className="block text-xs text-muted">
                  Anything created by this import starts and ends inside{" "}
                  {plan.year}, so a bill that no longer exists stays in that
                  year&rsquo;s history rather than appearing as due today. Turn this
                  off only when importing the year you are currently budgeting.
                </span>
              </span>
            </label>

            <label className="mt-3 flex gap-3 text-sm">
              <input
                type="checkbox"
                checked={updateExisting}
                onChange={(e) => setUpdateExisting(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Rewrite line items that already exist
                <span className="block text-xs text-muted">
                  Off means an item you already have keeps its planned amount, due
                  day and schedule; this import only adds {plan.year}&rsquo;s
                  figures. Leave it off when importing an older year.
                </span>
              </span>
            </label>
          </Card>

          {plan.notes.length > 0 ? (
            <Card>
              <h2 className="text-sm font-medium">Worth a look</h2>
              <ul className="mt-2 space-y-1 text-sm text-muted">
                {plan.notes.map((note, i) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </Card>
          ) : null}

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted">Accounts</h2>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {plan.accounts.map((account) => (
                <div
                  key={account.key}
                  className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
                >
                  <span className="flex-1 text-sm">
                    {account.name}
                    {account.exists ? (
                      <span className="ml-2 text-xs text-muted">already exists</span>
                    ) : null}
                  </span>
                  <div className="w-44">
                    <Select
                      value={accountKinds[account.key] ?? account.kind}
                      disabled={account.exists}
                      onChange={(e) => {
                        setAccountKinds((prev) => ({
                          ...prev,
                          [account.key]: e.target.value as AccountKind,
                        }));
                      }}
                    >
                      <option value="BANK">Bank account</option>
                      <option value="CREDIT_CARD">Credit card</option>
                      <option value="CASH">Cash</option>
                      <option value="OTHER">Other</option>
                    </Select>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted">Line items</h2>
            <div className="overflow-hidden rounded-lg border border-line bg-surface">
              {plan.lineItems.map((item) => {
                const isExcluded = excluded.has(item.key);
                return (
                  <div
                    key={item.key}
                    className={`border-t border-line px-4 py-2.5 first:border-t-0 ${
                      isExcluded ? "opacity-40" : ""
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={!isExcluded}
                        onChange={() => {
                          setExcluded((prev) => {
                            const next = new Set(prev);
                            if (next.has(item.key)) next.delete(item.key);
                            else next.add(item.key);
                            return next;
                          });
                        }}
                      />

                      <div className="min-w-0 flex-1">
                        <span className="text-sm font-medium">{item.name}</span>
                        {item.exists ? (
                          <span className="ml-2 text-xs text-muted">
                            {plan.updateExisting ? "will update" : "already exists — figures only"}
                          </span>
                        ) : null}
                        {item.duplicateName ? (
                          <span className="ml-2 rounded bg-danger/10 px-1.5 py-0.5 text-[11px] text-danger">
                            duplicate name — will be numbered
                          </span>
                        ) : null}
                        <p className="truncate text-xs text-muted">
                          {[
                            item.accountName,
                            item.categoryName,
                            item.dueDay ? `day ${item.dueDay}` : null,
                            `${item.monthCount} month${item.monthCount === 1 ? "" : "s"}`,
                            item.actualCount ? `${item.actualCount} actuals` : null,
                            item.overrideCount ? `${item.overrideCount} adjusted` : null,
                            item.hasPaymentUrl ? "payment link" : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>

                      <span className="tnum w-24 shrink-0 text-right text-sm">
                        {item.plannedAmount}
                      </span>

                      <div className="w-40 shrink-0">
                        <Select
                          value={kinds[item.key] ?? (item.kind as ItemKind)}
                          onChange={(e) =>
                            setKinds((prev) => ({
                              ...prev,
                              [item.key]: e.target.value as ItemKind,
                            }))
                          }
                        >
                          {(Object.keys(KIND_LABELS) as ItemKind[]).map((k) => (
                            <option key={k} value={k}>
                              {KIND_LABELS[k]}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </div>

                    {item.warnings.map((warning, i) => (
                      <p key={i} className="mt-1 pl-7 text-xs text-danger">
                        {warning}
                      </p>
                    ))}
                  </div>
                );
              })}
            </div>
          </section>

          {plan.skipped.length > 0 ? (
            <Card>
              <h2 className="text-sm font-medium">Left behind</h2>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {plan.skipped.map((s, i) => (
                  <li key={i}>
                    {s.name ?? `Row ${s.row}`} — {s.reason}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <div className="flex items-center gap-3">
            <Button type="button" onClick={apply} disabled={busy || includedCount === 0}>
              {busy ? "Importing…" : `Import ${includedCount} line items`}
            </Button>
            <button
              type="button"
              onClick={() => {
                setPlan(null);
                setDocument(null);
              }}
              className="text-sm text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={refreshPlan}
              className="text-sm text-muted hover:text-foreground"
            >
              Refresh preview
            </button>
          </div>
        </div>
      )}

      {batches.length > 0 ? (
        <section className="mt-10">
          <h2 className="mb-2 text-sm font-medium text-muted">Previous imports</h2>
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            {batches.map((batch) => (
              <div
                key={batch.id}
                className="flex items-center gap-3 border-t border-line px-4 py-2.5 first:border-t-0"
              >
                <span className="flex-1 text-sm">
                  {batch.label}
                  <span className="ml-2 text-xs text-muted">
                    {batch.rowCount} items ·{" "}
                    {new Date(batch.startedAt).toLocaleString()}
                    {batch.revertedAt ? " · reverted" : ""}
                  </span>
                </span>
                {batch.revertedAt ? null : (
                  <button
                    type="button"
                    onClick={() => revert(batch.id)}
                    disabled={busy}
                    className="text-sm text-danger hover:underline"
                  >
                    Undo
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

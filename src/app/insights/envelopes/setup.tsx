"use client";

import { useState, useTransition } from "react";
import type { EnvelopeSetup } from "@/server/envelopes";
type Tier = "ESSENTIAL" | "FLEXIBLE" | "UNPLANNED" | "BILLS";
import { Button, Card, CONTROL, Select } from "@/components/ui";
import {
  deleteGroupAction,
  resetGroupsAction,
  saveGroupAction,
  setCategoryGroupAction,
  setDebtPaymentAction,
  type EnvelopeState,
} from "../envelope-actions";

const TIERS: Array<{ value: Tier; label: string }> = [
  { value: "ESSENTIAL", label: "Essential" },
  { value: "FLEXIBLE", label: "Extra" },
  { value: "UNPLANNED", label: "Unplanned" },
  { value: "BILLS", label: "Paid as bills" },
];
const dollars = (cents: number | null) =>
  cents === null ? "" : String(Math.round(cents / 100));
const toCents = (text: string): number | null => {
  if (!text.trim()) return null;
  const n = Math.round(Number(text.replace(/[$,\s]/g, "")) * 100);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

type Group = EnvelopeSetup["groups"][number];

function GroupCard({
  group,
  groups,
  onDone,
}: {
  group: Group;
  groups: Group[];
  onDone: (s: EnvelopeState) => void;
}) {
  const [name, setName] = useState(group.name);
  const [tier, setTier] = useState<Tier>(group.tier as Tier);
  const [pending, start] = useTransition();
  const changed = name !== group.name || tier !== group.tier;
  return (
    <Card>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input
          aria-label="Budget name"
          className={CONTROL}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Select
          aria-label="Kind"
          value={tier}
          onChange={(e) => setTier(e.target.value as Tier)}
        >
          {TIERS.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </Select>
      </div>
      <ul className="mt-3 space-y-1.5">
        {group.categories.length ? (
          group.categories.map((c) => (
            <li
              key={c.id}
              className="flex items-center justify-between gap-2 text-sm"
            >
              <span className="min-w-0 flex-1 truncate">{c.name}</span>
              <span className="w-44 shrink-0">
                <Select
                  aria-label={`Budget for ${c.name}`}
                  value={group.id}
                  disabled={pending}
                  onChange={(e) =>
                    start(async () =>
                      onDone(
                        await setCategoryGroupAction(
                          c.id,
                          e.target.value || null,
                        ),
                      ),
                    )
                  }
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
                  <option value="">Needs a budget</option>
                </Select>
              </span>
            </li>
          ))
        ) : (
          <li className="text-xs text-muted">No categories in it yet.</li>
        )}
      </ul>
      <div className="mt-3 flex gap-2">
        <Button
          type="button"
          disabled={pending || !changed}
          onClick={() =>
            start(async () =>
              onDone(
                await saveGroupAction({
                  id: group.id,
                  name,
                  tier,
                }),
              ),
            )
          }
        >
          Save
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={pending}
          onClick={() =>
            start(async () => onDone(await deleteGroupAction(group.id)))
          }
        >
          Remove
        </Button>
      </div>
    </Card>
  );
}

export function EnvelopeSetupForm({
  setup,
  debt,
}: {
  setup: EnvelopeSetup;
  debt: {
    cents: number;
    automatic: boolean;
    targetCents: number | null;
  };
}) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  const [debtText, setDebtText] = useState(
    debt.automatic ? "" : dollars(debt.cents),
  );
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<Tier>("FLEXIBLE");
  return (
    <div className="space-y-4">
      {state?.message ? (
        <p
          className={`rounded-xl px-3.5 py-2.5 text-sm ${state.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}
        >
          {state.message}
        </p>
      ) : null}

      <Card>
        <h2 className="text-base font-bold">0% debt payment each month</h2>
        <p className="mt-0.5 max-w-prose text-xs text-muted">
          Comes off the top with the bills. Leave it empty to use the bill for
          that card (${dollars(debt.cents) || "0"} this month).
          {debt.targetCents
            ? ` Clearing the balance before the offer ends takes $${dollars(debt.targetCents)} a month.`
            : ""}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="w-36">
            <input
              aria-label="Debt payment"
              className={CONTROL}
              inputMode="decimal"
              placeholder="automatic"
              value={debtText}
              onChange={(e) => setDebtText(e.target.value)}
            />
          </span>
          <Button
            type="button"
            disabled={pending}
            onClick={() =>
              start(async () =>
                setState(await setDebtPaymentAction(toCents(debtText))),
              )
            }
          >
            Save
          </Button>
        </div>
      </Card>

      {setup.ungrouped.length ? (
        <Card>
          <h2 className="text-base font-bold">Not in a budget yet</h2>
          <p className="mt-0.5 text-xs text-muted">
            Their spending counts against the month, with no limit, until
            you place them.
          </p>
          <ul className="mt-3 space-y-1.5">
            {setup.ungrouped.map((c) => (
              <li
                key={c.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="min-w-0 flex-1 truncate">{c.name}</span>
                <span className="w-44 shrink-0">
                  <Select
                    aria-label={`Budget for ${c.name}`}
                    value=""
                    disabled={pending}
                    onChange={(e) =>
                      start(async () =>
                        setState(
                          await setCategoryGroupAction(
                            c.id,
                            e.target.value || null,
                          ),
                        ),
                      )
                    }
                  >
                    <option value="">Needs a budget</option>
                    {setup.groups.map((g) => (
                      <option key={g.id} value={g.id}>
                        {g.name}
                      </option>
                    ))}
                  </Select>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {setup.groups.map((g) => (
          <GroupCard
            key={`${g.id}:${g.name}:${g.tier}:${g.categories.length}`}
            group={g}
            groups={setup.groups}
            onDone={setState}
          />
        ))}
      </div>

      <Card>
        <h2 className="text-base font-bold">Kinds of budget</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li><b className="text-foreground">Essential</b>: needed every month (groceries, fuel). What its limit hasn&rsquo;t spent yet is held back from safe to spend.</li>
          <li><b className="text-foreground">Extra</b>: everything you could say no to. Each one&rsquo;s room is never more than what&rsquo;s safe to spend.</li>
          <li><b className="text-foreground">Unplanned</b>: irregular costs like repairs, the vet or lessons. No limit and never averaged; they come out of the month they happen. Known ones can be scheduled as a bill in their month.</li>
          <li><b className="text-foreground">Paid as bills</b>: these categories are paid through the bills, so they aren&rsquo;t everyday spending.</li>
        </ul>
        <p className="mt-2 text-xs text-muted">Limits aren&rsquo;t money: what one doesn&rsquo;t spend isn&rsquo;t something to use up, and nothing carries over.</p>
        <div className="mt-3">
          <Button
            type="button"
            variant="quiet"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Remove every budget and make the suggested set again from your categories? Limits you set are cleared.")) start(async () => setState(await resetGroupsAction()));
            }}
          >
            Start over with the suggested budgets
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold">Add a budget</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="w-56">
            <input
              aria-label="New budget name"
              className={CONTROL}
              placeholder="Name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
          </span>
          <span className="w-36">
            <Select
              aria-label="Kind"
              value={newTier}
              onChange={(e) => setNewTier(e.target.value as Tier)}
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </Select>
          </span>
          <Button
            type="button"
            disabled={pending || !newName.trim()}
            onClick={() =>
              start(async () => {
                const r = await saveGroupAction({
                  name: newName,
                  tier: newTier,
                });
                if (r.ok) setNewName("");
                setState(r);
              })
            }
          >
            Add
          </Button>
        </div>
      </Card>
    </div>
  );
}

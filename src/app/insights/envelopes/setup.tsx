"use client";

import { useState, useTransition } from "react";
import type { EnvelopeSetup } from "@/server/envelopes";
import type { GroupTier as Tier } from "@/lib/envelopes";
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
  { value: "PLANNED", label: "Planned" },
  { value: "FLEXIBLE", label: "Flexible" },
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
  const [tier, setTier] = useState<Tier>(group.tier);
  const [saveUp, setSaveUp] = useState(group.saveUp);
  const [target, setTarget] = useState(dollars(group.saveUpTargetCents));
  const [pending, start] = useTransition();
  const changed =
    name !== group.name ||
    tier !== group.tier ||
    saveUp !== group.saveUp ||
    target !== dollars(group.saveUpTargetCents);
  return (
    <Card>
      <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
        <input
          aria-label="Envelope name"
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
      <label className="mt-2 flex flex-wrap items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={saveUp}
          onChange={(e) => setSaveUp(e.target.checked)}
        />
        Save-up: keeps what isn&rsquo;t spent, for a cost that comes in a lump
        {saveUp ? (
          <span className="w-28">
            <input
              aria-label="Target"
              className={CONTROL}
              inputMode="decimal"
              placeholder="target $"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </span>
        ) : null}
      </label>
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
                  aria-label={`Envelope for ${c.name}`}
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
                  <option value="">Everything else</option>
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
                  saveUp,
                  saveUpTargetCents: saveUp ? toCents(target) : null,
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
    neededCents: number | null;
    byPayday: boolean;
  };
}) {
  const [state, setState] = useState<EnvelopeState | null>(null);
  const [pending, start] = useTransition();
  const [debtText, setDebtText] = useState(
    debt.automatic ? "" : dollars(debt.cents),
  );
  const [newName, setNewName] = useState("");
  const [newTier, setNewTier] = useState<Tier>("FLEXIBLE");
  const each = debt.byPayday ? "payday" : "month";
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
        <h2 className="text-base font-bold">Debt payment each {each}</h2>
        <p className="mt-0.5 max-w-prose text-xs text-muted">
          Set aside before any flexible spending. Leave it empty to use the
          plan&rsquo;s payments (${dollars(debt.cents) || "0"} now).
          {debt.neededCents
            ? ` Clearing the 0% balance in time takes $${dollars(debt.neededCents)} each ${each}.`
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
          <h2 className="text-base font-bold">Not in an envelope yet</h2>
          <p className="mt-0.5 text-xs text-muted">
            These count under Everything else, a flexible envelope, until you
            place them.
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
                    aria-label={`Envelope for ${c.name}`}
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
                    <option value="">Everything else</option>
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
            key={`${g.id}:${g.name}:${g.tier}:${g.saveUp}:${g.saveUpTargetCents}:${g.categories.length}`}
            group={g}
            groups={setup.groups}
            onDone={setState}
          />
        ))}
      </div>

      <Card>
        <h2 className="text-base font-bold">Kinds of envelope</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li><b className="text-foreground">Essential</b>: protected; what isn&rsquo;t used stays for a later pay period.</li>
          <li><b className="text-foreground">Planned</b>: giving and other spending you plan for.</li>
          <li><b className="text-foreground">Flexible</b>: one shared pot; an envelope that runs over takes from the others.</li>
          <li><b className="text-foreground">Paid as bills</b>: these categories are paid through the plan&rsquo;s bills, so the envelopes skip them.</li>
        </ul>
        <div className="mt-3">
          <Button
            type="button"
            variant="quiet"
            disabled={pending}
            onClick={() => {
              if (window.confirm("Remove every envelope and make the suggested set again from your categories? Limits you set are cleared.")) start(async () => setState(await resetGroupsAction()));
            }}
          >
            Start over with the suggested envelopes
          </Button>
        </div>
      </Card>

      <Card>
        <h2 className="text-base font-bold">Add an envelope</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="w-56">
            <input
              aria-label="New envelope name"
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
                  saveUp: false,
                  saveUpTargetCents: null,
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

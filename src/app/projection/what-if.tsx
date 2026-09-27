"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, Card, TextInput } from "@/components/ui";
import { toDecimalString } from "@/lib/money";

export function WhatIf({
  currentPay,
  horizonDays,
  safeToPayCents,
}: {
  currentPay: string;
  horizonDays: number;
  safeToPayCents: number;
}) {
  const router = useRouter();
  const [pay, setPay] = useState(currentPay);
  const [days, setDays] = useState(String(horizonDays));

  const apply = () => {
    const params = new URLSearchParams();
    if (pay.trim()) params.set("pay", pay.replace(/[$,\s]/g, ""));
    if (days.trim()) params.set("days", days);
    router.push(`/projection?${params.toString()}`);
  };

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex-1">
          <span className="mb-1 block text-xs font-medium">
            If I pay this today
          </span>
          <TextInput
            value={pay}
            onChange={(e) => setPay(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            inputMode="decimal"
            placeholder={toDecimalString(safeToPayCents)}
          />
        </label>

        <label className="w-32">
          <span className="mb-1 block text-xs font-medium">Days ahead</span>
          <TextInput
            value={days}
            onChange={(e) => setDays(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && apply()}
            type="number"
            min={7}
            max={365}
          />
        </label>

        <Button type="button" onClick={apply}>
          Recalculate
        </Button>

        {currentPay ? (
          <button
            type="button"
            onClick={() => {
              setPay("");
              router.push(`/projection?days=${days}`);
            }}
            className="text-sm text-muted hover:text-foreground"
          >
            Clear
          </button>
        ) : null}
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateDfyScarcity } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OFFER } from "@/lib/marketing/content";

/**
 * The done-for-you scarcity counter.
 *
 * Two numbers somebody edits by hand, on purpose. A countdown that decrements itself, or
 * a timer that resets at midnight, is the kind of thing a buyer notices exactly once and
 * then discounts everything else on the page along with it. If the number is going to be
 * on a public page it has to be true, which means somebody has to maintain it.
 *
 * Blank "remaining" clears the counter and it disappears from every public page. That is
 * the honest state for a number nobody is keeping up to date.
 */
export function DfyScarcityForm({
  initialTotal,
  initialRemaining,
}: {
  initialTotal: number;
  initialRemaining: number | null;
}) {
  const [total, setTotal] = useState(String(initialTotal));
  const [remaining, setRemaining] = useState(initialRemaining === null ? "" : String(initialRemaining));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shown = remaining.trim() === "" ? null : Math.max(0, Math.round(Number(remaining) || 0));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dfy-remaining">Builds remaining</Label>
          <Input
            id="dfy-remaining"
            inputMode="numeric"
            placeholder="Blank = counted automatically"
            value={remaining}
            onChange={(e) => setRemaining(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dfy-total">Out of</Label>
          <Input
            id="dfy-total"
            inputMode="numeric"
            value={total}
            onChange={(e) => setTotal(e.target.value)}
          />
        </div>
      </div>

      <p className="text-sm text-[var(--muted-foreground)]">
        {shown === 0 ? (
          <>
            The offer bar is hidden. At zero slots it disappears rather than announcing a
            closed offer above a button that asks you to take it.
          </>
        ) : (
          <>
            {shown === null ? "The bar counts itself." : "The bar reads:"}{" "}
            {shown === null ? null : (
              <strong className="text-[var(--foreground)]">{OFFER.bar(shown)}</strong>
            )}
            {shown === null
              ? " - and blank means it counts itself, one slot per tenant that has started building"
              : " - a manual override, which wins over the automatic count"}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await updateDfyScarcity(Number(total) || 20, shown);
              setMsg(r.ok ? "Saved." : r.error);
            });
          }}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}

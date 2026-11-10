"use client";

import { useState, useTransition } from "react";
import { updateRegion } from "@/features/workspace/actions/region";
import { COMMON_TIME_ZONES } from "@/lib/region/zone";
import { PAYMENT_CURRENCIES } from "@/lib/region/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function RegionForm({ initial }: { initial: { timeZone: string; currency: string } }) {
  const [timeZone, setTimeZone] = useState(initial.timeZone);
  const [currency, setCurrency] = useState(initial.currency);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateRegion({ timeZone, currency });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="region-tz">Timezone</Label>
        <Input id="region-tz" list="region-tz-list" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
        <datalist id="region-tz-list">
          {COMMON_TIME_ZONES.map((z) => (
            <option key={z} value={z} />
          ))}
        </datalist>
        <p className="text-xs text-[var(--muted-foreground)]">
          Your booking hours, the times people book and the times in their reminders use this zone. Your own
          screens keep showing IST.
        </p>
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="region-currency">Payment currency</Label>
        <select
          id="region-currency"
          className="h-9 rounded-md border bg-[var(--background)] px-3 text-sm"
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
        >
          {PAYMENT_CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} - {c.label}
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--muted-foreground)]">
          What your respondents pay in, on your own Razorpay account. Anything other than INR needs international
          payments switched on in Razorpay. Payment links already sent keep the currency they were made in.
        </p>
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p> : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { updateBookingUrl } from "@/features/workspace/actions/booking";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function BookingSettingsForm({ initial }: { initial: string }) {
  const [url, setUrl] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateBookingUrl(url);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="booking-url">Calendar link</Label>
        <Input
          id="booking-url"
          type="url"
          inputMode="url"
          placeholder="https://cal.com/your-team/intro"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Calendly, Cal.com, or any scheduling link. Shown as the &ldquo;Book a 1-on-1
          call&rdquo; button on respondents&apos; results. Leave blank to hide the button.
        </p>
      </div>
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      ) : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

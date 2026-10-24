"use client";

import { useState, useTransition } from "react";
import { updateCallBooking } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PlatformBookingType {
  id: string;
  name: string;
  slug: string;
  durationMin: number;
}

/**
 * Where the 30-minute setup call gets booked, set once for the whole platform.
 *
 * WHY THIS IS A PICKER. The link is one of this app's own booking pages, so offering a
 * list of them instead of a text box removes the only two ways the setting can be wrong:
 * a typo, and a slug that was renamed after the link was pasted. The resolver reads the
 * slug fresh on every render, so renaming a booking type cannot break the ribbon.
 *
 * The URL box is for an external calendar and is mutually exclusive with the picker,
 * because two filled fields would leave "which one is live" to be guessed from the code.
 */
export function CallBookingForm({
  types,
  initialTypeId,
  initialUrl,
}: {
  types: PlatformBookingType[];
  initialTypeId: string | null;
  initialUrl: string | null;
}) {
  const [typeId, setTypeId] = useState(initialTypeId ?? "");
  const [url, setUrl] = useState(initialUrl ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const r = await updateCallBooking(typeId, url);
      if (r.ok) {
        setMsg(
          typeId || url.trim()
            ? "Saved. The booking button is live on every trial ribbon."
            : "Cleared. The call is not offered anywhere.",
        );
      } else {
        setError(r.error ?? "Could not save.");
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Booking type on this app</Label>
        <select
          value={typeId}
          onChange={(e) => {
            setTypeId(e.target.value);
            if (e.target.value) setUrl("");
          }}
          className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-3 text-sm"
        >
          <option value="">Not set</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.durationMin} min) - /b/{t.slug}
            </option>
          ))}
        </select>
        <p className="text-xs text-[var(--muted-foreground)]">
          {types.length === 0 ? (
            <>
              There are no active booking types on the platform calendar yet. Create one in
              Calendar first, then it appears here.
            </>
          ) : (
            <>
              This is the link a tenant gets on their trial ribbon, once everything we need
              for the call is in their workspace.
            </>
          )}
        </p>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Or an external calendar URL</Label>
        <Input
          value={url}
          onChange={(e) => {
            setUrl(e.target.value);
            if (e.target.value.trim()) setTypeId("");
          }}
          placeholder="https://"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Only for a calendar outside this app. Choosing a booking type above is better:
          bookings land in Calendar, and the three Meta events fire off it.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save booking link"}
        </Button>
        {msg ? <span className="text-xs text-green-600">{msg}</span> : null}
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
      </div>
    </div>
  );
}

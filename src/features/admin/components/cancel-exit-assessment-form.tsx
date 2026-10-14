"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateCancelExitAssessment } from "@/features/admin/actions/platform-integrations";

/**
 * Where a cancelling customer is sent once the cancellation is booked - the owner's own
 * exit assessment, asking why they left.
 *
 * Platform-level and optional. Blank means the cancel simply confirms and stops: a
 * cancellation must never fail, or be held up, because a survey link is missing.
 */
export function CancelExitAssessmentForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateCancelExitAssessment(url);
      setMsg(r.ok ? "Saved." : r.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="exit-assessment" className="text-xs">Exit assessment URL</Label>
      <Input
        id="exit-assessment"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://assess360.divineleads.guru/a/why-you-left"
      />
      <p className="text-xs text-[var(--muted-foreground)]">
        Shown to a customer straight after they cancel, as the next thing to do. Any URL works, though an
        assessment you built here means the answers land in your own leads. Blank hides the step. The cancellation
        is already booked before this is offered, so somebody closing the tab still cancels.
      </p>
      <div><Button size="sm" onClick={save} disabled={pending}>Save exit assessment</Button></div>
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

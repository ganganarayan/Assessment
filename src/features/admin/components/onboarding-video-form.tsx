"use client";

import { useState, useTransition } from "react";
import { updatePlatformOnboardingVideo } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The one onboarding video every tenant sees while they are in trial.
 *
 * Platform-wide by design: it explains Assess360, not any one workspace, so a tenant
 * never sets their own. Blank clears it and the written steps stand alone, which is
 * exactly how they were written - the video is the nicety, the steps are the
 * instruction.
 */
export function OnboardingVideoForm({ initial }: { initial: string | null }) {
  const [url, setUrl] = useState(initial ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setMsg(null);
    setError(null);
    startTransition(async () => {
      const r = await updatePlatformOnboardingVideo(url);
      if (r.ok) setMsg(url.trim() ? "Saved - every tenant sees it on their dashboard." : "Cleared - tenants see the written steps only.");
      else setError(r.error ?? "Could not save.");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Embed URL</Label>
        <Input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://www.youtube.com/embed/..."
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          It must be the <strong>embed</strong> URL, not the watch page. A normal YouTube or
          Vimeo link refuses to load in a frame, and the tenant gets an empty box where the
          introduction should be. Leave blank to show the written steps on their own.
        </p>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save video"}
        </Button>
        {msg ? <span className="text-xs text-green-600">{msg}</span> : null}
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
      </div>
    </div>
  );
}

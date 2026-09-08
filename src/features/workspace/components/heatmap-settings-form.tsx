"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

type SaveResult = { ok: boolean; error?: string };

/**
 * Editor for the heatmap / session-recording snippet (e.g. MS Clarity). The save
 * action is injected so the same form drives a tenant workspace, a super admin
 * impersonating a tenant, and the platform/Gita singleton. Stored verbatim; blank = off.
 */
export function HeatmapSettingsForm({
  initial,
  saveAction,
}: {
  initial: string;
  saveAction: (code: string) => Promise<SaveResult>;
}) {
  const [code, setCode] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await saveAction(code);
      setMsg(r.ok ? (code.trim() ? "Recording code saved." : "Recording code cleared.") : r.error ?? "Something went wrong.");
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Heatmap Recording Code (e.g. MS Clarity)</Label>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          rows={6}
          spellCheck={false}
          placeholder={'Paste the full snippet from Clarity → Settings → Overview, e.g.\n<script>...clarity...</script>'}
          className="flex w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 font-mono text-xs text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Runs on every funnel page (opt-in → questions → submit → result), so the whole session
          records. Leave blank to turn recording off.
        </p>
      </div>
      <div>
        <Button size="sm" onClick={save} disabled={pending}>Save recording code</Button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

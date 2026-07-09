"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIST } from "@/lib/date";
import { setStatsWindow, setAssessmentStatsWindow } from "@/features/admin/actions/stats-window";

/** Set/clear the reporting start date (IST). Floors the dashboard, stats, contacts
 *  and submissions to records from this instant onward; clearing shows everything.
 *  Pass assessmentId to set THAT assessment's own window instead of the global one. */
export function StatsWindowForm({
  startAtInput,
  startAtIso,
  assessmentId,
}: {
  startAtInput: string;
  startAtIso: string | null;
  assessmentId?: string;
}) {
  const router = useRouter();
  const [value, setValue] = useState(startAtInput);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = (clear: boolean) =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const arg = clear ? null : value;
      const r = assessmentId
        ? await setAssessmentStatsWindow(assessmentId, arg)
        : await setStatsWindow(arg);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      if (clear) setValue("");
      setMsg(clear ? "Cleared — showing all data." : "Saved — showing data from the selected date onward.");
      router.refresh();
    });

  return (
    <div className="flex max-w-xl flex-col gap-4 rounded-lg border p-4">
      <p className="text-sm">
        {startAtIso ? (
          <>Currently showing data from <strong>{formatIST(startAtIso)} IST</strong> onward.</>
        ) : (
          <>Currently showing <strong>all data</strong> (all time).</>
        )}
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="startAt">Start date &amp; time (IST)</Label>
        <Input
          id="startAt"
          type="datetime-local"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className="w-64"
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <Button disabled={pending || !value} onClick={() => save(false)}>
          {pending ? "Saving…" : "Save start date"}
        </Button>
        <Button variant="outline" disabled={pending} onClick={() => save(true)}>
          Clear (show all)
        </Button>
      </div>

      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-500">{err}</p> : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        Applies to the Dashboard, Stats, Contacts, and Submissions (and their exports). Older records
        stay in the database and reappear the moment you clear the date — nothing is deleted. Existing
        result links you&apos;ve already sent are unaffected.
      </p>
    </div>
  );
}

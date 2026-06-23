"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  recomputeCategoryBands,
  type RecomputeSummary,
} from "@/features/admin/actions/recompute-bands";

/**
 * Super-admin one-time backfill: re-apply the saved category bands above to every
 * completed contact (using their stored scores). Preview first, then Apply.
 */
export function BandRecompute({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<RecomputeSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = (apply: boolean) => {
    if (
      apply &&
      !confirm(
        "Apply the saved category bands to ALL completed contacts?\n\nThis rewrites each contact's per-category band label + meaning from their stored scores. Scores, the overall band, and AI messages are NOT changed. Safe to re-run.",
      )
    )
      return;
    setErr(null);
    start(async () => {
      const r = await recomputeCategoryBands(assessmentId, apply);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setRes(r.data ?? null);
      if (apply) router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Recompute category bands for existing contacts</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Re-applies the saved category bands above to every completed submission, using each
        contact&apos;s stored category scores. Only the per-category band label and meaning change.
        Scores, the overall band, and AI messages are not touched. Run Preview first.
      </p>
      <div className="flex gap-3">
        <Button variant="outline" disabled={pending} onClick={() => run(false)}>
          {pending ? "Working…" : "Preview (dry run)"}
        </Button>
        <Button disabled={pending} onClick={() => run(true)}>
          {pending ? "Working…" : "Apply"}
        </Button>
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
      {res ? (
        <div className="flex flex-col gap-2 text-sm">
          <p>
            <strong>{res.applied ? "Applied." : "Dry run."}</strong> Scanned {res.scanned} completed
            contacts, {res.changedSubmissions} change, {res.changedCells} category cells affected.
          </p>
          {res.samples.length > 0 ? (
            <div className="rounded border p-2 text-xs">
              <p className="mb-1 font-medium">Sample (first {res.samples.length}):</p>
              {res.samples.map((s, i) => (
                <div key={i} className="border-b py-1 last:border-0">
                  <span className="font-mono">{s.customerId ?? "—"}</span>:{" "}
                  {s.changes.map((c, j) => (
                    <span key={j}>
                      {c.category}: {c.from ?? "—"} → {c.to ?? "—"}
                      {j < s.changes.length - 1 ? "; " : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">
              No contacts needed a change (their category bands already match the saved config).
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

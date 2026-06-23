"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  reconstructLostAnswers,
  type ReconstructSummary,
} from "@/features/admin/actions/reconstruct-answers";

/**
 * Super-admin one-time recovery: rebuild answers that an earlier question-edit
 * cascade wiped, inferred from the stored category score/max. Preview, then Apply.
 */
export function ReconstructAnswers({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [res, setRes] = useState<ReconstructSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const run = (apply: boolean) => {
    if (
      apply &&
      !confirm(
        "Recreate the wiped answers (inferred from each contact's stored category score/max)?\n\nOnly reconstructs when exactly one answer is missing in a category and the inferred value maps to an option. Scores are unchanged. Safe to re-run.",
      )
    )
      return;
    setErr(null);
    start(async () => {
      const r = await reconstructLostAnswers(assessmentId, apply);
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
      <p className="text-sm font-medium">Recover wiped answers (existing contacts)</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Rebuilds per-question answers that an earlier question-edit removed, inferring each from the
        stored category score and max. Only acts when exactly one answer is missing in a category and
        the value maps cleanly to an option. Scores are not changed. Run Preview first, then re-run
        the AI re-run so statements pick up the restored detail.
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
            <strong>{res.applied ? "Applied." : "Dry run."}</strong> Scanned {res.scanned} · would
            restore {res.reconstructed} answers across {res.affectedSubmissions} contacts · ambiguous{" "}
            {res.ambiguous} · unresolvable {res.unresolvable}.
          </p>
          {res.samples.length > 0 ? (
            <div className="rounded border p-2 text-xs">
              <p className="mb-1 font-medium">Sample (first {res.samples.length}):</p>
              {res.samples.map((s, i) => (
                <div key={i} className="border-b py-1 last:border-0">
                  <span className="font-mono">{s.customerId ?? "—"}</span>:{" "}
                  {s.items.map((it, j) => (
                    <span key={j}>
                      {it.question} = {it.value}
                      {j < s.items.length - 1 ? "; " : ""}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-xs text-[var(--muted-foreground)]">Nothing to restore.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

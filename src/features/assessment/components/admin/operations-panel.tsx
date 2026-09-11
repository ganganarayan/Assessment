"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { BandRecompute } from "@/features/assessment/components/admin/band-recompute";
import { ReconstructAnswers } from "@/features/assessment/components/admin/reconstruct-answers";
import { AiRerun } from "@/features/assessment/components/admin/ai-rerun";
import { CrmResend } from "@/features/assessment/components/admin/crm-resend";
import { CustomSender } from "@/features/assessment/components/admin/custom-sender";
import { aiRerunCount } from "@/features/admin/actions/ai-rerun";

export interface OpAssessment {
  id: string;
  title: string;
}

/**
 * Global operations console (Settings → Operations). The data-maintenance + CRM
 * senders that used to live on each assessment's edit page now run here against a
 * SELECTED assessment. The Score sender is global (all changed contacts). Switching
 * the assessment remounts each tool (via key) so its state resets cleanly.
 */
const DEFAULT_KEY = "assess360.opsDefaultAssessment";

export function OperationsPanel({ assessments }: { assessments: OpAssessment[] }) {
  const [sel, setSel] = useState(assessments[0]?.id ?? "");
  const [savedDefault, setSavedDefault] = useState(false);
  const [counts, setCounts] = useState<{ completions: number; submissions: number } | null>(null);
  const [countErr, setCountErr] = useState<string | null>(null);

  // Auto-load the completions / submissions count whenever the selected assessment
  // changes — no button. Same per-assessment reporting-start floor as the count the
  // re-run uses, so what's shown is exactly what a re-run would process.
  useEffect(() => {
    if (!sel) return;
    let cancelled = false;
    setCounts(null);
    setCountErr(null);
    aiRerunCount(sel).then((r) => {
      if (cancelled) return;
      if (r.ok) setCounts(r.data ?? null);
      else setCountErr(r.error);
    });
    return () => {
      cancelled = true;
    };
  }, [sel]);

  // Apply the saved default assessment on mount (client-only, so no SSR mismatch).
  useEffect(() => {
    try {
      const d = localStorage.getItem(DEFAULT_KEY);
      if (d && assessments.some((a) => a.id === d)) setSel(d);
    } catch {
      /* localStorage unavailable */
    }
  }, [assessments]);

  function setAsDefault() {
    try {
      localStorage.setItem(DEFAULT_KEY, sel);
      setSavedDefault(true);
      setTimeout(() => setSavedDefault(false), 1500);
    } catch {
      /* ignore */
    }
  }

  if (assessments.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No assessments yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor="op-assessment" className="text-sm font-medium">
          Assessment
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="op-assessment"
            value={sel}
            onChange={(e) => setSel(e.target.value)}
            className="h-9 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
          >
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title}
              </option>
            ))}
          </select>
          <Button size="sm" variant="outline" onClick={setAsDefault}>
            {savedDefault ? "Saved ✓" : "Set as default"}
          </Button>
        </div>
        <p className="text-sm" aria-live="polite">
          {countErr ? (
            <span className="text-red-500">{countErr}</span>
          ) : counts ? (
            <>
              <span className="text-green-600">●</span>{" "}
              <strong>{counts.completions}</strong> completions / <strong>{counts.submissions}</strong>{" "}
              submissions for this assessment
            </>
          ) : (
            <span className="text-[var(--muted-foreground)]">Loading counts…</span>
          )}
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          These tools run against the selected assessment (the Score sender is global — every changed
          contact). The count above uses this assessment&apos;s saved reporting-start date; recompute
          and the AI re-run process the completions only (the rest have no stored result). Switching
          assessments resets the panels below.
        </p>
      </div>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Recompute &amp; recover (existing contacts)</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Re-apply the saved bands to stored scores, and rebuild answers an earlier question-edit
          removed. Run Preview first. Scores aren&apos;t changed.
        </p>
        <BandRecompute key={`band-${sel}`} assessmentId={sel} />
        <ReconstructAnswers key={`recon-${sel}`} assessmentId={sel} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">AI messages (existing contacts)</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Regenerate the AI message for every completed contact using their current bands + the active
          prompt. Run this after the band recompute above.
        </p>
        <AiRerun key={`ai-${sel}`} assessmentId={sel} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">CRM senders</h2>
        <p className="text-xs text-[var(--muted-foreground)]">
          Background senders to your CRM. Each runs server-side inside its own daily IST window, one
          contact every random delay — survives page close and deploys. Every send is logged under{" "}
          <a href="/admin/webhook-logs?view=crm" className="underline">Webhook Logs → CRM sends</a>.
          The custom sender targets the selected assessment; the score sender is global. Lifecycle
          webhooks (opt-in / started / completed) still fire immediately.
        </p>
        <CrmResend />
        <CustomSender key={`custom-${sel}`} assessmentId={sel} />
      </section>
    </div>
  );
}

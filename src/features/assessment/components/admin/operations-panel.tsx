"use client";

import { useState } from "react";
import { BandRecompute } from "@/features/assessment/components/admin/band-recompute";
import { ReconstructAnswers } from "@/features/assessment/components/admin/reconstruct-answers";
import { AiRerun } from "@/features/assessment/components/admin/ai-rerun";
import { CrmResend } from "@/features/assessment/components/admin/crm-resend";
import { CustomSender } from "@/features/assessment/components/admin/custom-sender";

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
export function OperationsPanel({ assessments }: { assessments: OpAssessment[] }) {
  const [sel, setSel] = useState(assessments[0]?.id ?? "");

  if (assessments.length === 0) {
    return <p className="text-sm text-[var(--muted-foreground)]">No assessments yet.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <label htmlFor="op-assessment" className="text-sm font-medium">
          Assessment
        </label>
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
        <p className="text-xs text-[var(--muted-foreground)]">
          These tools run against the selected assessment (the Score sender is global — every changed
          contact). Switching assessments resets the panels below.
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

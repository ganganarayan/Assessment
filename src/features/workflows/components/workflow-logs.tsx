"use client";

import { useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { RUN_STATUS_CLASS, RUN_STATUS_LABEL } from "@/features/workflows/types";
import type { JourneyRow } from "@/features/workflows/logs-data";

/**
 * Every person who entered a sequence, and what happened to them.
 *
 * Collapsed to one line each. The question that brings somebody here is almost always
 * "did this person get the thing", which the line answers; the step-by-step is for when
 * the answer is no.
 */

const SEND_CLASS: Record<string, string> = {
  SENT: "text-emerald-600 dark:text-emerald-400",
  FAILED: "text-red-600 dark:text-red-400",
  SKIPPED: "text-amber-600 dark:text-amber-400",
};

export function WorkflowLogs({ rows, basePath }: { rows: JourneyRow[]; basePath: string }) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (rows.length === 0) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-[var(--muted-foreground)]">
        Nobody has entered a sequence yet. A journey appears here the moment somebody is enrolled,
        before anything is sent, so this is also where to look when you are not sure a trigger
        fired.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.map((r) => {
        const open = openId === r.id;
        return (
          <article key={r.id} className="rounded-lg border">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : r.id)}
              aria-expanded={open}
              className="flex w-full flex-col gap-1 p-3 text-left hover:bg-[var(--muted)]/40"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{r.who}</span>
                {r.aboutWorkspace ? (
                  <span className="rounded-full border border-[var(--field-border)] px-2 py-0.5 text-[10px] text-[var(--muted-foreground)]">
                    workspace
                  </span>
                ) : null}
                <span
                  className={cn(
                    "rounded-full border px-2 py-0.5 text-[11px] font-medium",
                    RUN_STATUS_CLASS[r.status],
                  )}
                >
                  {RUN_STATUS_LABEL[r.status]}
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {r.workflowName} · step {Math.min(r.stepNumber, Math.max(r.totalSteps, 1))} of{" "}
                  {r.totalSteps}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                Started {r.startedLabel}
                {r.finishedLabel ? ` · finished ${r.finishedLabel}` : ""}
                {r.dueLabel ? ` · next step due ${r.dueLabel}` : ""}
                {r.sends.length > 0 ? ` · ${r.sends.length} step${r.sends.length === 1 ? "" : "s"} recorded` : ""}
              </p>
              {/* 🔴 The reason it stopped belongs on the CLOSED row. "Cancelled" on its own
                  is the thing people come here to ask about, and making them click to
                  find out why is the difference between a log and a log nobody reads. */}
              {r.stopReason ? <p className="text-xs text-amber-600 dark:text-amber-400">{r.stopReason}</p> : null}
              {r.lastError ? <p className="text-xs text-red-600 dark:text-red-400">{r.lastError}</p> : null}
            </button>

            {open ? (
              <div className="border-t px-3 py-2">
                {r.sends.length === 0 ? (
                  <p className="text-xs text-[var(--muted-foreground)]">
                    Nothing recorded yet. A waiting run has sent nothing, which is not the same as
                    having failed.
                  </p>
                ) : (
                  <ol className="flex flex-col gap-1">
                    {r.sends.map((s, i) => (
                      <li key={s.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                        <span className="w-5 shrink-0 text-[var(--muted-foreground)]">{i + 1}.</span>
                        <span className="font-medium">{s.what}</span>
                        <span className={SEND_CLASS[s.status] ?? "text-[var(--muted-foreground)]"}>
                          {s.status.toLowerCase()}
                        </span>
                        {s.toAddress ? (
                          <span className="text-[var(--muted-foreground)]">{s.toAddress}</span>
                        ) : null}
                        <span className="text-[var(--muted-foreground)]">{s.at}</span>
                        {s.error ? (
                          <span className="w-full text-red-600 dark:text-red-400">{s.error}</span>
                        ) : null}
                      </li>
                    ))}
                  </ol>
                )}
                <Link
                  href={`${basePath}/${r.workflowId}`}
                  className="mt-2 inline-block text-xs underline"
                >
                  Open the sequence
                </Link>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

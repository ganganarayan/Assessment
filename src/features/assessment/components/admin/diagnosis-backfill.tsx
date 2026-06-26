"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { diagnosisBackfillCount, diagnosisBackfillBatch } from "@/features/admin/actions/crm-resend";

/**
 * One-time backfill: send each existing contact's diagnosis (overall band word) to
 * the CRM as a minimal {email + contact.assessment_diagnosis} update. Client-driven
 * with a small gap so it's gentle on the CRM; keep the page open until it finishes.
 */
export function DiagnosisBackfill({ assessmentId }: { assessmentId: string }) {
  const [total, setTotal] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [skipped, setSkipped] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const stopRef = useRef(false);

  const GAP_MS = 2000; // pause between rounds (gentle on the CRM)
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  const preview = async () => {
    setErr(null);
    setBusy(true);
    const r = await diagnosisBackfillCount(assessmentId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setTotal(r.data?.total ?? 0);
    setDone(0);
    setSucceeded(0);
    setFailed(0);
    setSkipped(0);
    setFinished(false);
  };

  const run = async () => {
    if (
      !confirm(
        "Send the diagnosis (overall band word) to the CRM for ALL completed contacts?\n\nMinimal payload (email + contact.assessment_diagnosis, tagged diagnosis_update). Keep this page open until it finishes. Make sure your CRM 'diagnosis_update' automation only updates the field.",
      )
    )
      return;
    setErr(null);
    setRunning(true);
    setFinished(false);
    setDone(0);
    setSucceeded(0);
    setFailed(0);
    setSkipped(0);
    stopRef.current = false;
    let offset = 0;
    let s = 0;
    let f = 0;
    let sk = 0;
    try {
      while (!stopRef.current) {
        const r = await diagnosisBackfillBatch(assessmentId, offset);
        if (!r.ok) {
          setErr(r.error);
          break;
        }
        offset = r.data?.nextOffset ?? offset;
        s += r.data?.succeeded ?? 0;
        f += r.data?.failed ?? 0;
        sk += r.data?.skipped ?? 0;
        setTotal(r.data?.total ?? null);
        setDone(offset);
        setSucceeded(s);
        setFailed(f);
        setSkipped(sk);
        if (r.data?.done) {
          setFinished(true);
          break;
        }
        await sleep(GAP_MS);
      }
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    stopRef.current = true;
  };

  const pct = total && total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Backfill diagnosis to CRM (all contacts)</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Sends every completed contact&apos;s diagnosis (the overall band word) to the CRM endpoint as
        a minimal <code>email + contact.assessment_diagnosis</code> update, tagged{" "}
        <code>contact.event_type = diagnosis_update</code>. Your CRM matches by email and fills the
        field. Runs in the background of this page; keep it open until it finishes.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={running || busy} onClick={preview}>
          {busy ? "Working…" : "Preview (count)"}
        </Button>
        <Button disabled={running || busy} onClick={run}>
          {running ? "Sending…" : "Send diagnosis to all"}
        </Button>
        {running ? (
          <Button variant="outline" onClick={stop} className="border-red-500 text-red-600 hover:bg-red-500/10">
            Stop
          </Button>
        ) : null}
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
      {total !== null ? (
        <p className="text-sm">
          {finished ? <strong>Done. </strong> : running ? <strong>Sending… </strong> : null}
          {done} / {total} processed{total > 0 ? ` (${pct}%)` : ""} · {succeeded} sent · {failed} failed ·{" "}
          {skipped} skipped (no email/diagnosis)
        </p>
      ) : null}
    </div>
  );
}

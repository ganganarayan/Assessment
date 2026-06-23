"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  aiRerunCount,
  regenerateAiBatch,
  previewAiSamples,
  type AiSample,
} from "@/features/admin/actions/ai-rerun";

/**
 * Super-admin: regenerate AI statements for all completed contacts using the
 * CURRENT bands + active prompt. Runs in client-driven rounds with live progress
 * (each round is a few billable LLM calls); each new message becomes the served
 * default immediately, so partial progress persists if stopped.
 */
export function AiRerun({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [total, setTotal] = useState<number | null>(null);
  const [done, setDone] = useState(0);
  const [succeeded, setSucceeded] = useState(0);
  const [failed, setFailed] = useState(0);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [samples, setSamples] = useState<AiSample[] | null>(null);
  const stopRef = useRef(false);

  const sample = async () => {
    setErr(null);
    setBusy(true);
    setSamples(null);
    const r = await previewAiSamples(assessmentId, 4);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setSamples(r.data?.samples ?? []);
  };

  const preview = async () => {
    setErr(null);
    setBusy(true);
    const r = await aiRerunCount(assessmentId);
    setBusy(false);
    if (!r.ok) {
      setErr(r.error);
      return;
    }
    setTotal(r.data?.total ?? 0);
    setDone(0);
    setSucceeded(0);
    setFailed(0);
    setFinished(false);
  };

  const run = async () => {
    if (
      !confirm(
        "Regenerate AI messages for ALL completed contacts using the current bands + prompt?\n\nEach is a billable AI call, and the new message becomes the served default (old versions are kept). Keep this page open until it finishes.",
      )
    )
      return;
    setErr(null);
    setRunning(true);
    setFinished(false);
    setDone(0);
    setSucceeded(0);
    setFailed(0);
    stopRef.current = false;
    let offset = 0;
    let s = 0;
    let f = 0;
    try {
      while (!stopRef.current) {
        const r = await regenerateAiBatch(assessmentId, offset);
        if (!r.ok) {
          setErr(r.error);
          break;
        }
        offset = r.data?.nextOffset ?? offset;
        s += r.data?.succeeded ?? 0;
        f += r.data?.failed ?? 0;
        setTotal(r.data?.total ?? null);
        setDone(offset);
        setSucceeded(s);
        setFailed(f);
        if (r.data?.done) {
          setFinished(true);
          break;
        }
      }
    } finally {
      setRunning(false);
      router.refresh();
    }
  };

  const stop = () => {
    stopRef.current = true;
  };

  const pct = total && total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Re-run AI messages for existing contacts</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Regenerates each completed contact&apos;s AI message from their CURRENT bands (after the
        recompute above) using the active prompt. The new message becomes the served default; old
        versions are kept. Runs in rounds of 5, ~15–20s each, so this takes a few minutes for ~85
        contacts. Keep this page open until it finishes.
      </p>
      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={running || busy} onClick={preview}>
          {busy ? "Working…" : "Preview (count)"}
        </Button>
        <Button variant="outline" disabled={running || busy} onClick={sample}>
          {busy ? "Working…" : "Preview sample (not saved)"}
        </Button>
        <Button disabled={running || busy} onClick={run}>
          {running ? "Regenerating…" : "Run AI re-run"}
        </Button>
        {running ? (
          <Button variant="outline" onClick={stop} className="border-red-500 text-red-600 hover:bg-red-500/10">
            Stop
          </Button>
        ) : null}
      </div>
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
      {total !== null ? (
        <div className="flex flex-col gap-1 text-sm">
          <p>
            {finished ? <strong>Done. </strong> : running ? <strong>Running… </strong> : null}
            {done} / {total} processed{total > 0 ? ` (${pct}%)` : ""} · {succeeded} updated · {failed} failed
          </p>
          {!running && !finished && done === 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              {total} completed contacts will be regenerated (~{Math.max(1, Math.ceil(total / 5)) * 20}s).
            </p>
          ) : null}
          {failed > 0 ? (
            <p className="text-xs text-[var(--muted-foreground)]">
              Failures usually mean AI is off or the key is invalid — check Settings, then re-run (already-updated
              contacts just get refreshed again).
            </p>
          ) : null}
        </div>
      ) : null}

      {samples ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-[var(--muted-foreground)]">
            {samples.length} sample{samples.length === 1 ? "" : "s"} generated from real contacts (nothing saved). If
            you want changes, tell me how to tweak the prompt and I&apos;ll redeploy, then re-sample.
          </p>
          {samples.map((s, i) => (
            <div key={i} className="rounded border p-3 text-sm">
              <p className="mb-1 text-xs font-medium text-[var(--muted-foreground)]">
                <span className="font-mono">{s.customerId ?? "—"}</span>
                {s.firstName ? ` · ${s.firstName}` : ""}
                {` · ${s.profession ?? "no profession"}`} · {s.scorePercent}%
                {s.band ? ` · ${s.band}` : ""}
              </p>
              <p className="whitespace-pre-line">{s.text ?? "(no response — is AI enabled?)"}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

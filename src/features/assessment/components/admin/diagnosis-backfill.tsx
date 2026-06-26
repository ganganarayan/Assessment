"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  getDiagnosisUrl,
  setCrmDiagnosisUrl,
  sendTestDiagnosis,
  diagnosisBackfillCount,
  diagnosisBackfillBatch,
} from "@/features/admin/actions/crm-resend";

/**
 * One-time backfill: send each existing contact's diagnosis (overall band word) to
 * the CRM as a minimal {email + contact.assessment_diagnosis} update. Posts to its
 * OWN endpoint (the diagnosis_update automation) — never the score_updated one.
 * Client-driven with a small gap; keep the page open until it finishes.
 */
export function DiagnosisBackfill({ assessmentId }: { assessmentId: string }) {
  const [url, setUrl] = useState("");
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [cfgMsg, setCfgMsg] = useState<string | null>(null);
  const [cfgErr, setCfgErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Test send.
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tDiag, setTDiag] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  // Bulk run.
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

  useEffect(() => {
    void (async () => {
      const r = await getDiagnosisUrl();
      if (r.ok && r.data) {
        setSavedUrl(r.data.url);
        if (r.data.url) setUrl(r.data.url);
      }
    })();
  }, []);

  const saveUrl = () =>
    start(async () => {
      setCfgErr(null);
      setCfgMsg(null);
      const r = await setCrmDiagnosisUrl(url);
      if (!r.ok) {
        setCfgErr(r.error);
        return;
      }
      setSavedUrl(url.trim() || null);
      setCfgMsg("Diagnosis endpoint saved.");
    });

  const doTest = () =>
    start(async () => {
      setTestErr(null);
      setTestResult(null);
      const r = await sendTestDiagnosis({ name: tName, email: tEmail, phone: tPhone, diagnosis: tDiag });
      if (!r.ok) {
        setTestErr(r.error);
        return;
      }
      setTestResult(`Sent. HTTP ${r.data?.status}. Response: ${r.data?.body || "(empty)"}`);
    });

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
    if (!savedUrl) {
      setErr("Set + save the diagnosis endpoint URL first.");
      return;
    }
    if (
      !confirm(
        "Send the diagnosis (overall band word) to the CRM for ALL completed contacts?\n\nMinimal payload (email + contact.assessment_diagnosis, tagged diagnosis_update), posted to the diagnosis endpoint above. Keep this page open until it finishes. Make sure that automation only updates the field (no WhatsApp).",
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
        Sends every completed contact&apos;s diagnosis (the overall band word) to the CRM as a{" "}
        <code>contact_name + contact_email + contact_phone + contact.assessment_diagnosis</code> update,
        tagged <code>contact.event_type = diagnosis_update</code>. Posts to the{" "}
        <strong>diagnosis endpoint below</strong> — a separate automation from the score_updated drip,
        so it never triggers WhatsApp. Your CRM matches by email and fills the field.
      </p>

      <div className="flex flex-col gap-2">
        <Label>Diagnosis CRM endpoint URL (separate from the score endpoint)</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={url}
            placeholder="https://login.applygitawisdom.com/api/automations/.../execute"
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button variant="outline" disabled={pending} onClick={saveUrl}>
            Save URL
          </Button>
        </div>
        {cfgMsg ? <p className="text-xs text-green-600">{cfgMsg}</p> : null}
        {cfgErr ? <p className="text-sm text-red-500">{cfgErr}</p> : null}
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium">Test send (one contact, to the diagnosis endpoint above)</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
          <Input placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
          <Input placeholder="Phone" value={tPhone} onChange={(e) => setTPhone(e.target.value)} />
          <Input
            placeholder="Diagnosis (e.g. Critical)"
            value={tDiag}
            onChange={(e) => setTDiag(e.target.value)}
          />
        </div>
        <div>
          <Button variant="outline" disabled={pending} onClick={doTest}>
            {pending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {testResult ? <p className="text-xs text-green-600">{testResult}</p> : null}
        {testErr ? <p className="text-sm text-red-500">{testErr}</p> : null}
      </div>

      <div className="flex flex-wrap gap-3">
        <Button variant="outline" disabled={running || busy} onClick={preview}>
          {busy ? "Working…" : "Preview (count)"}
        </Button>
        <Button disabled={running || busy || !savedUrl} onClick={run}>
          {running ? "Sending…" : "Send diagnosis to all contacts"}
        </Button>
        {running ? (
          <Button variant="outline" onClick={stop} className="border-red-500 text-red-600 hover:bg-red-500/10">
            Stop
          </Button>
        ) : null}
      </div>
      {!savedUrl ? (
        <p className="text-xs text-amber-600">Set + save the diagnosis endpoint URL to enable sending.</p>
      ) : null}
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

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { HourSelect, CrmPendingList } from "@/features/assessment/components/admin/crm-controls";
import {
  getScoreStatus,
  setCrmResendUrl,
  setScoreSchedule,
  startScore,
  stopScore,
  retryFailedScore,
  listScorePending,
  sendTestCrm,
  type ScoreStatus,
  type CrmPending,
} from "@/features/admin/actions/crm-resend";

/**
 * Super-admin: the SCORE (score_updated) background sender. Sends each changed
 * contact to the endpoint inside a daily IST window, one every random min-max
 * minutes, in the background (survives page close + deploys). Fires WhatsApp.
 */
export function CrmResend() {
  const [status, setStatus] = useState<ScoreStatus | null>(null);
  const [pendingQ, setPendingQ] = useState<CrmPending>({ count: 0, rows: [] });
  const [url, setUrl] = useState("");
  const [startHour, setStartHour] = useState(9);
  const [endHour, setEndHour] = useState(21);
  const [delayMin, setDelayMin] = useState(10);
  const [delayMax, setDelayMax] = useState(12);
  const [seeded, setSeeded] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tMsg, setTMsg] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const refresh = async () => {
    const [r, p] = await Promise.all([getScoreStatus(), listScorePending()]);
    if (r.ok && r.data) {
      setStatus(r.data);
      if (!seeded) {
        if (r.data.url) setUrl(r.data.url);
        setStartHour(r.data.startHour);
        setEndHour(r.data.endHour);
        setDelayMin(r.data.delayMin);
        setDelayMax(r.data.delayMax);
        setSeeded(true);
      }
    }
    if (p.ok && p.data) setPendingQ(p.data);
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (status?.running && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 5000);
    } else if (!status?.running && pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.running]);

  const saveUrl = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await setCrmResendUrl(url);
      if (!r.ok) return setErr(r.error);
      setMsg("Endpoint saved.");
      await refresh();
    });

  const saveSchedule = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await setScoreSchedule({ startHour, endHour, delayMin, delayMax });
      if (!r.ok) return setErr(r.error);
      setMsg("Schedule saved.");
      await refresh();
    });

  const doStart = () =>
    start(async () => {
      if (!confirm("Start sending changed contacts to the CRM (score_updated)?\n\nRuns in the background inside your daily window, one every random delay. You can close the page; it resumes after a deploy.")) return;
      setErr(null);
      setMsg(null);
      const r = await startScore();
      if (!r.ok) return setErr(r.error);
      setMsg(`Started. ${r.data?.enqueued ?? 0} queued this run.`);
      await refresh();
    });

  const doStop = () =>
    start(async () => {
      setErr(null);
      await stopScore();
      setMsg("Stop requested (takes effect after the current send).");
      await refresh();
    });

  const doRetry = () =>
    start(async () => {
      setErr(null);
      await retryFailedScore();
      setMsg("Failed rows re-queued.");
      await refresh();
    });

  const doTest = () =>
    start(async () => {
      setTestErr(null);
      setTestResult(null);
      const r = await sendTestCrm({ name: tName, email: tEmail, phone: tPhone, message: tMsg });
      if (!r.ok) return setTestErr(r.error);
      setTestResult(`Sent. HTTP ${r.data?.status}. Response: ${r.data?.body || "(empty)"}`);
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Score sender (score_updated)</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Sends each contact whose data changed in-app (band recompute / AI re-run) as{" "}
        <code>contact.event_type = score_updated</code>, in the background, inside the daily IST window
        below, one every random delay. Fires WhatsApp - keep the gap generous.
      </p>

      <div className="flex flex-col gap-2">
        <Label>Score endpoint URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={url} placeholder="https://login.applygitawisdom.com/api/automations/.../execute" onChange={(e) => setUrl(e.target.value)} />
          <Button variant="outline" disabled={pending} onClick={saveUrl}>
            Save URL
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label>Daily window (IST) &amp; delay</Label>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-[var(--muted-foreground)]">From</span>
          <HourSelect value={startHour} onChange={setStartHour} ariaLabel="Day start" />
          <span className="text-[var(--muted-foreground)]">to</span>
          <HourSelect value={endHour} onChange={setEndHour} ariaLabel="Day end" />
          <span className="ml-2 text-[var(--muted-foreground)]">delay</span>
          <Input type="number" min={1} value={delayMin} onChange={(e) => setDelayMin(Number(e.target.value))} className="w-20" aria-label="Min delay minutes" />
          <span className="text-[var(--muted-foreground)]">to</span>
          <Input type="number" min={1} value={delayMax} onChange={(e) => setDelayMax(Number(e.target.value))} className="w-20" aria-label="Max delay minutes" />
          <span className="text-[var(--muted-foreground)]">min</span>
          <Button variant="outline" disabled={pending} onClick={saveSchedule}>
            Save schedule
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium">Test send (one contact, to the endpoint above)</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
          <Input placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
          <Input placeholder="Phone" value={tPhone} onChange={(e) => setTPhone(e.target.value)} />
        </div>
        <Textarea placeholder="Message (AI statement)" value={tMsg} onChange={(e) => setTMsg(e.target.value)} rows={3} />
        <div>
          <Button variant="outline" disabled={pending} onClick={doTest}>
            {pending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {testResult ? <p className="text-xs text-green-600">{testResult}</p> : null}
        {testErr ? <p className="text-sm text-red-500">{testErr}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {status?.running ? (
          <Button variant="outline" disabled={pending} onClick={doStop} className="border-red-500 text-red-600 hover:bg-red-500/10">
            Stop
          </Button>
        ) : (
          <Button disabled={pending || !status?.url} onClick={doStart}>
            Start sending
          </Button>
        )}
        <Button variant="outline" disabled={pending} onClick={() => void refresh()}>
          Refresh
        </Button>
        {status && status.failed > 0 ? (
          <Button variant="outline" disabled={pending} onClick={doRetry}>
            Retry failed ({status.failed})
          </Button>
        ) : null}
      </div>

      {status ? (
        <p className="text-sm">
          {status.running ? <strong>Running… </strong> : null}
          Pending {status.pending} · Sent {status.sent} · Failed {status.failed}
          {!status.url ? " · (set the endpoint URL to enable)" : ""}
        </p>
      ) : null}
      {status?.needsResume ? (
        <p className="text-xs text-amber-600">A run was interrupted (likely a deploy). Click <strong>Start sending</strong> to resume.</p>
      ) : null}

      <CrmPendingList rows={pendingQ.rows} count={pendingQ.count} />

      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  );
}

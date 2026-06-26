"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  getCrmResendStatus,
  setCrmResendUrl,
  startCrmResend,
  stopCrmResend,
  retryFailedCrmResend,
  sendTestCrm,
  type CrmResendStatus,
} from "@/features/admin/actions/crm-resend";

/**
 * Super-admin: configure + drive the CRM "score_updated" resend drip. Sends each
 * changed contact to the endpoint, one every random 10-12 minutes, in the background.
 */
export function CrmResend() {
  const [status, setStatus] = useState<CrmResendStatus | null>(null);
  const [url, setUrl] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Test send.
  const [tName, setTName] = useState("");
  const [tEmail, setTEmail] = useState("");
  const [tPhone, setTPhone] = useState("");
  const [tMsg, setTMsg] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const doTest = () =>
    start(async () => {
      setTestErr(null);
      setTestResult(null);
      const r = await sendTestCrm({ name: tName, email: tEmail, phone: tPhone, message: tMsg });
      if (!r.ok) {
        setTestErr(r.error);
        return;
      }
      setTestResult(`Sent. HTTP ${r.data?.status}. Response: ${r.data?.body || "(empty)"}`);
    });

  const refresh = async () => {
    const r = await getCrmResendStatus();
    if (r.ok && r.data) {
      setStatus(r.data);
      if (url === "" && r.data.url) setUrl(r.data.url);
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll while the drip is running so progress updates live.
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
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setMsg("Endpoint saved.");
      await refresh();
    });

  const doStart = () =>
    start(async () => {
      if (
        !confirm(
          "Start sending the contacts pending right now to the CRM endpoint?\n\nOne send every random 10-12 minutes, in the background (you can close the page, and it resumes after a deploy). Only the currently-pending set is sent. Make sure your bands + AI messages are final.",
        )
      )
        return;
      setErr(null);
      setMsg(null);
      const r = await startCrmResend();
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setMsg("Drip started. It runs in the background.");
      await refresh();
    });

  const doStop = () =>
    start(async () => {
      setErr(null);
      await stopCrmResend();
      setMsg("Stop requested (takes effect after the current wait).");
      await refresh();
    });

  const doRetry = () =>
    start(async () => {
      setErr(null);
      await retryFailedCrmResend();
      setMsg("Failed rows reset; they'll be retried on the next run.");
      await refresh();
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">CRM resend (score_updated)</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        Sends each contact whose data changed in-app (band recompute / AI re-run) to the endpoint
        below as <code>contact.event_type = score_updated</code>, one every random 10-12 minutes, in the
        background. Run this only when bands + AI messages are final.
      </p>

      <div className="flex flex-col gap-2">
        <Label>CRM endpoint URL</Label>
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
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium">Test send (one contact, to the endpoint above)</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
          <Input placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
          <Input placeholder="Phone" value={tPhone} onChange={(e) => setTPhone(e.target.value)} />
        </div>
        <Textarea
          placeholder="Message (AI statement)"
          value={tMsg}
          onChange={(e) => setTMsg(e.target.value)}
          rows={3}
        />
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
          <Button
            variant="outline"
            disabled={pending}
            onClick={doStop}
            className="border-red-500 text-red-600 hover:bg-red-500/10"
          >
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
        <p className="text-xs text-amber-600">
          A run was interrupted (likely a deploy). Click <strong>Start sending</strong> to resume the
          remaining {status.pending}.
        </p>
      ) : null}
      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  );
}

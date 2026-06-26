"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HourSelect, CrmPendingList } from "@/features/assessment/components/admin/crm-controls";
import { CUSTOM_FIELD_KEYS, CUSTOM_FIELD_LABELS } from "@/lib/crm/custom-fields";
import {
  getCustomConfig,
  setCrmDiagnosisUrl,
  setCustomConfig,
  startCustom,
  stopCustom,
  retryFailedCustom,
  listCustomPending,
  sendTestCustom,
  type CustomConfig,
  type CrmPending,
} from "@/features/admin/actions/crm-resend";

/**
 * The generic CUSTOM CRM sender (was "Diagnosis"). Fully configurable: editable
 * name (logged), endpoint, event_type routing value, which payload fields to send
 * (checkboxes), daily IST window + random delay. Runs in the background; sends to
 * every completed contact of this assessment when Started.
 */
export function CustomSender({ assessmentId }: { assessmentId: string }) {
  const [cfg, setCfg] = useState<CustomConfig | null>(null);
  const [pendingQ, setPendingQ] = useState<CrmPending>({ count: 0, rows: [] });
  const [name, setName] = useState("Diagnosis");
  const [url, setUrl] = useState("");
  const [eventType, setEventType] = useState("diagnosis_update");
  const [fields, setFields] = useState<string[]>([]);
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
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testErr, setTestErr] = useState<string | null>(null);

  const refresh = async () => {
    const [r, p] = await Promise.all([getCustomConfig(), listCustomPending()]);
    if (r.ok && r.data) {
      setCfg(r.data);
      if (!seeded) {
        setName(r.data.name);
        if (r.data.url) setUrl(r.data.url);
        setEventType(r.data.eventType);
        setFields(r.data.fields);
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
    if (cfg?.running && !pollRef.current) {
      pollRef.current = setInterval(() => void refresh(), 5000);
    } else if (!cfg?.running && pollRef.current) {
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
  }, [cfg?.running]);

  const toggleField = (k: string) =>
    setFields((f) => (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]));

  const saveUrl = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await setCrmDiagnosisUrl(url);
      if (!r.ok) return setErr(r.error);
      setMsg("Endpoint saved.");
      await refresh();
    });

  const saveSettings = () =>
    start(async () => {
      setErr(null);
      setMsg(null);
      const r = await setCustomConfig({ name, eventType, fields, startHour, endHour, delayMin, delayMax });
      if (!r.ok) return setErr(r.error);
      setMsg("Settings saved.");
      await refresh();
    });

  const doStart = () =>
    start(async () => {
      if (!confirm(`Start the "${name}" send to ALL completed contacts of this assessment?\n\nRuns in the background inside your daily window, one every random delay. You can close the page; it resumes after a deploy.`)) return;
      setErr(null);
      setMsg(null);
      const r = await startCustom(assessmentId);
      if (!r.ok) return setErr(r.error);
      setMsg(`Started. ${r.data?.enqueued ?? 0} queued this run.`);
      await refresh();
    });

  const doStop = () =>
    start(async () => {
      setErr(null);
      await stopCustom();
      setMsg("Stop requested (takes effect after the current send).");
      await refresh();
    });

  const doRetry = () =>
    start(async () => {
      setErr(null);
      await retryFailedCustom();
      setMsg("Failed rows re-queued.");
      await refresh();
    });

  const doTest = () =>
    start(async () => {
      setTestErr(null);
      setTestResult(null);
      const r = await sendTestCustom({ name: tName, email: tEmail, phone: tPhone });
      if (!r.ok) return setTestErr(r.error);
      setTestResult(`Sent. HTTP ${r.data?.status}. Response: ${r.data?.body || "(empty)"}`);
    });

  return (
    <div className="flex flex-col gap-3 rounded-lg border p-4">
      <p className="text-sm font-medium">Custom CRM sender</p>
      <p className="text-xs text-[var(--muted-foreground)]">
        A fully configurable background send to every completed contact: pick the name (shown in the
        log), endpoint, <code>contact.event_type</code> value, and exactly which payload fields go.
        Runs inside the daily IST window, one every random delay. Separate from the score sender — never
        touches the WhatsApp endpoint.
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1">
          <Label>Name (logged)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Diagnosis" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <Label>Event type (routing key)</Label>
          <Input value={eventType} onChange={(e) => setEventType(e.target.value)} placeholder="diagnosis_update" />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Endpoint URL</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://login.applygitawisdom.com/api/automations/.../execute" />
          <Button variant="outline" disabled={pending} onClick={saveUrl}>
            Save URL
          </Button>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label>Payload fields to include</Label>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {CUSTOM_FIELD_KEYS.map((k) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={fields.includes(k)} onChange={() => toggleField(k)} />
              <span>{CUSTOM_FIELD_LABELS[k]}</span>
              <code className="text-xs text-[var(--muted-foreground)]">{k}</code>
            </label>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
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
        </div>
      </div>

      <div>
        <Button variant="outline" disabled={pending} onClick={saveSettings}>
          Save settings
        </Button>
      </div>

      <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
        <p className="text-xs font-medium">Test send (uses saved fields + this contact)</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input placeholder="Name" value={tName} onChange={(e) => setTName(e.target.value)} />
          <Input placeholder="Email" value={tEmail} onChange={(e) => setTEmail(e.target.value)} />
          <Input placeholder="Phone" value={tPhone} onChange={(e) => setTPhone(e.target.value)} />
        </div>
        <div>
          <Button variant="outline" disabled={pending} onClick={doTest}>
            {pending ? "Sending…" : "Send test"}
          </Button>
        </div>
        {testResult ? <p className="text-xs text-green-600">{testResult}</p> : null}
        {testErr ? <p className="text-sm text-red-500">{testErr}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {cfg?.running ? (
          <Button variant="outline" disabled={pending} onClick={doStop} className="border-red-500 text-red-600 hover:bg-red-500/10">
            Stop
          </Button>
        ) : (
          <Button disabled={pending || !cfg?.url} onClick={doStart}>
            Start sending
          </Button>
        )}
        <Button variant="outline" disabled={pending} onClick={() => void refresh()}>
          Refresh
        </Button>
        {cfg && cfg.failed > 0 ? (
          <Button variant="outline" disabled={pending} onClick={doRetry}>
            Retry failed ({cfg.failed})
          </Button>
        ) : null}
      </div>

      {cfg ? (
        <p className="text-sm">
          {cfg.running ? <strong>Running… </strong> : null}
          Pending {cfg.pending} · Sent {cfg.sent} · Failed {cfg.failed}
          {!cfg.url ? " · (set the endpoint URL to enable)" : ""}
        </p>
      ) : null}
      {cfg?.needsResume ? (
        <p className="text-xs text-amber-600">A run was interrupted (likely a deploy). Click <strong>Start sending</strong> to resume.</p>
      ) : null}

      <CrmPendingList rows={pendingQ.rows} count={pendingQ.count} />

      {msg ? <p className="text-xs text-green-600">{msg}</p> : null}
      {err ? <p className="text-sm text-red-500">{err}</p> : null}
    </div>
  );
}

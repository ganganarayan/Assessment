"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSmtpSettings, updateWabaSettings, sendSmtpTest, type NurtureSettingsView } from "@/features/nurture/actions";

/**
 * SMTP + WhatsApp (Meta Cloud API) connection settings for the acting scope. Secrets
 * (SMTP password, WABA token) are write-only: a stored one shows as "saved", and the
 * field is left blank unless you're changing it.
 */
export function NurtureConnectionSettings({ initial }: { initial: NurtureSettingsView }) {
  return (
    <div className="flex flex-col gap-6">
      <SmtpForm initial={initial.smtp} />
      <div className="border-t pt-6">
        <WabaForm initial={initial.waba} />
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium">{label}</span>
      {children}
    </label>
  );
}

function SmtpForm({ initial }: { initial: NurtureSettingsView["smtp"] }) {
  const [v, setV] = useState({
    host: initial.host, port: initial.port != null ? String(initial.port) : "", secure: initial.secure,
    user: initial.user, pass: "", fromName: initial.fromName, fromEmail: initial.fromEmail,
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateSmtpSettings(v);
      setMsg(r.ok ? "Email (SMTP) settings saved." : r.error);
    });

  const [testTo, setTestTo] = useState(initial.fromEmail);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [testPending, startTest] = useTransition();
  const sendTest = () =>
    startTest(async () => {
      setTestMsg(null);
      const r = await sendSmtpTest(testTo);
      setTestMsg(r.ok ? `Test email sent to ${testTo.trim()}. Check the inbox.` : r.error);
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">Email — SMTP</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Host"><Input value={v.host} placeholder="smtp.yourhost.com" onChange={(e) => setV({ ...v, host: e.target.value })} /></Field>
        <Field label="Port"><Input value={v.port} placeholder="587" inputMode="numeric" onChange={(e) => setV({ ...v, port: e.target.value })} /></Field>
        <Field label="Username"><Input value={v.user} onChange={(e) => setV({ ...v, user: e.target.value })} /></Field>
        <Field label={`Password ${initial.hasPass ? "(saved — leave blank to keep)" : ""}`}>
          <Input type="password" value={v.pass} placeholder={initial.hasPass ? "••••••••" : ""} onChange={(e) => setV({ ...v, pass: e.target.value })} />
        </Field>
        <Field label="From name"><Input value={v.fromName} placeholder="Ganga Narayan Das" onChange={(e) => setV({ ...v, fromName: e.target.value })} /></Field>
        <Field label="From email"><Input value={v.fromEmail} placeholder="hello@yourdomain.com" onChange={(e) => setV({ ...v, fromEmail: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.secure} onChange={(e) => setV({ ...v, secure: e.target.checked })} />
        Use TLS/SSL (secure) — usually on for port 465, off for 587
      </label>
      <div>
        <Button size="sm" onClick={save} disabled={pending}>Save email settings</Button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}

      <div className="mt-1 flex flex-col gap-2 border-t pt-4">
        <p className="text-xs text-[var(--muted-foreground)]">
          Send a test email using the saved settings. Save first, then test.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1">
            <Field label="Send test email to">
              <Input
                type="email"
                value={testTo}
                placeholder="you@example.com"
                onChange={(e) => setTestTo(e.target.value)}
              />
            </Field>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={sendTest}
            disabled={testPending || !testTo.trim()}
          >
            {testPending ? "Sending…" : "Send test email"}
          </Button>
        </div>
        {testMsg ? <p className="text-sm text-[var(--muted-foreground)]">{testMsg}</p> : null}
      </div>
    </div>
  );
}

function WabaForm({ initial }: { initial: NurtureSettingsView["waba"] }) {
  const [v, setV] = useState({
    phoneNumberId: initial.phoneNumberId, accessToken: "",
    apiVersion: initial.apiVersion || "v21.0", defaultCountryCode: initial.defaultCountryCode || "91",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateWabaSettings(v);
      setMsg(r.ok ? "WhatsApp (WABA) settings saved." : r.error);
    });
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-medium">WhatsApp — Meta Cloud API</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Phone number ID"><Input value={v.phoneNumberId} onChange={(e) => setV({ ...v, phoneNumberId: e.target.value })} /></Field>
        <Field label={`Access token ${initial.hasToken ? "(saved — leave blank to keep)" : ""}`}>
          <Input type="password" value={v.accessToken} placeholder={initial.hasToken ? "••••••••" : ""} onChange={(e) => setV({ ...v, accessToken: e.target.value })} />
        </Field>
        <Field label="API version"><Input value={v.apiVersion} placeholder="v21.0" onChange={(e) => setV({ ...v, apiVersion: e.target.value })} /></Field>
        <Field label="Default country code"><Input value={v.defaultCountryCode} placeholder="91" onChange={(e) => setV({ ...v, defaultCountryCode: e.target.value })} /></Field>
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        The token is a permanent WhatsApp Cloud API access token. Default country code is prepended to
        local mobiles (e.g. a 10-digit Indian number) so WhatsApp gets a full international number.
      </p>
      <div>
        <Button size="sm" onClick={save} disabled={pending}>Save WhatsApp settings</Button>
      </div>
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

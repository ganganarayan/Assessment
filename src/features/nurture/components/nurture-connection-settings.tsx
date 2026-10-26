"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateSmtpSettings, updateWabaSettings, sendSmtpTest, type NurtureSettingsView } from "@/features/nurture/actions";
import { EMAIL_PROVIDER_OPTIONS, DEFAULT_PROVIDER_ID, emailProviderOption } from "@/lib/email/catalog";
import { WhatsAppConnect } from "@/features/whatsapp/components/whatsapp-connect";
import { type WhatsAppConnectView } from "@/features/whatsapp/types";

/**
 * SMTP + WhatsApp (Meta Cloud API) connection settings for the acting scope. Secrets
 * (SMTP password, WABA token) are write-only: a stored one shows as "saved", and the
 * field is left blank unless you're changing it.
 */
export function NurtureConnectionSettings({
  initial,
  showWaba = true,
  whatsapp = null,
}: {
  initial: NurtureSettingsView;
  /** False while WhatsApp is parked - saved credentials stay in the row, unread. */
  showWaba?: boolean;
  /**
   * One-click connect state for this scope. Null renders the manual fields alone,
   * which is the right fallback: a scope with no platform Meta app behind it must not
   * be shown a button that can only dead-end.
   */
  whatsapp?: WhatsAppConnectView | null;
}) {
  return (
    <div className="flex flex-col gap-6">
      <SmtpForm initial={initial.smtp} />
      {showWaba ? (
        <div className="flex flex-col gap-4 border-t pt-6">
          {/* The button first, because for anyone starting out it is the whole job.
              The five fields stay underneath for a number that was connected by hand
              before this existed, and as the way through when Meta is having a bad
              day. */}
          {whatsapp ? <WhatsAppConnect initial={whatsapp} /> : null}
          <WabaForm initial={initial.waba} collapsed={!!whatsapp?.connected} />
        </div>
      ) : null}
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

/**
 * The email card.
 *
 * 🔴 The provider comes FIRST and the fields follow from it, rather than a wall of SMTP
 * boxes with an API key bolted on. Railway blocks outbound SMTP, so the common case is
 * an API key and a From address, and showing somebody host, port, username, password
 * and a TLS checkbox when none of them apply is how you get a support ticket that says
 * "I filled everything in and nothing sends".
 */
function SmtpForm({ initial }: { initial: NurtureSettingsView["smtp"] }) {
  const [v, setV] = useState({
    provider: initial.provider || DEFAULT_PROVIDER_ID, apiKey: "",
    host: initial.host, port: initial.port != null ? String(initial.port) : "", secure: initial.secure,
    user: initial.user, pass: "", fromName: initial.fromName, fromEmail: initial.fromEmail,
  });
  const chosen = emailProviderOption(v.provider);
  const isSmtp = chosen.transport === "SMTP";
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateSmtpSettings(v);
      setMsg(r.ok ? "Email settings saved." : r.error);
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
      <p className="text-sm font-medium">Email</p>

      <Field label="Who sends your email">
        <select
          value={v.provider}
          onChange={(e) => setV({ ...v, provider: e.target.value })}
          className="h-9 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
        >
          {EMAIL_PROVIDER_OPTIONS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-xs text-[var(--muted-foreground)]">{chosen.keyHint}</p>

      {isSmtp ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          🔴 This app is hosted on Railway, which blocks outbound SMTP. Your own mail server
          almost certainly will not connect from here, and the failure looks like a wrong
          password. Pick one of the providers above it, or use the test button below to find
          out in ten seconds.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {isSmtp ? (
          <>
            <Field label="Host"><Input value={v.host} placeholder="smtp.yourhost.com" onChange={(e) => setV({ ...v, host: e.target.value })} /></Field>
            <Field label="Port"><Input value={v.port} placeholder="587" inputMode="numeric" onChange={(e) => setV({ ...v, port: e.target.value })} /></Field>
            <Field label="Username"><Input value={v.user} onChange={(e) => setV({ ...v, user: e.target.value })} /></Field>
            <Field label={`Password ${initial.hasPass ? "(saved - leave blank to keep)" : ""}`}>
              <Input type="password" value={v.pass} placeholder={initial.hasPass ? "••••••••" : ""} onChange={(e) => setV({ ...v, pass: e.target.value })} />
            </Field>
          </>
        ) : (
          <Field label={`${chosen.keyLabel} ${initial.hasApiKey ? "(saved - leave blank to keep)" : ""}`}>
            <Input type="password" value={v.apiKey} placeholder={initial.hasApiKey ? "••••••••" : ""} onChange={(e) => setV({ ...v, apiKey: e.target.value })} />
          </Field>
        )}
        <Field label="From name"><Input value={v.fromName} placeholder="Ganga Narayan Das" onChange={(e) => setV({ ...v, fromName: e.target.value })} /></Field>
        <Field label="From email"><Input value={v.fromEmail} placeholder="hello@yourdomain.com" onChange={(e) => setV({ ...v, fromEmail: e.target.value })} /></Field>
      </div>
      {isSmtp ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={v.secure} onChange={(e) => setV({ ...v, secure: e.target.checked })} />
          Use TLS/SSL (secure) - usually on for port 465, off for 587
        </label>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          🟡 The From address has to be on a domain you have verified with {chosen.label}.
          A provider will not send for a domain it cannot authenticate, and a free mailbox
          address such as gmail.com can never be one.
        </p>
      )}
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

/**
 * The manual five fields.
 *
 * Still here on purpose. One-click covers everybody starting from scratch, but a
 * number connected by hand before this existed keeps working through exactly these
 * columns, and when Meta's popup refuses to finish, a pasted token is the way through.
 *
 * `collapsed` folds it away once a connection exists, because five empty credential
 * boxes underneath the word "Connected" read as if something is still missing.
 */
function WabaForm({
  initial,
  collapsed = false,
}: {
  initial: NurtureSettingsView["waba"];
  collapsed?: boolean;
}) {
  const [v, setV] = useState({
    phoneNumberId: initial.phoneNumberId, businessAccountId: initial.businessAccountId, accessToken: "",
    apiVersion: initial.apiVersion || "v21.0", defaultCountryCode: initial.defaultCountryCode || "91",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [open, setOpen] = useState(!collapsed);
  const [pending, start] = useTransition();
  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateWabaSettings(v);
      setMsg(r.ok ? "WhatsApp (WABA) settings saved." : r.error);
    });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">WhatsApp - Meta Cloud API</p>
        {collapsed ? (
          <Button size="sm" variant="ghost" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide these fields" : "Enter details by hand"}
          </Button>
        ) : null}
      </div>
      {open ? (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Phone number ID"><Input value={v.phoneNumberId} onChange={(e) => setV({ ...v, phoneNumberId: e.target.value })} /></Field>
            <Field label="Business Account ID (for templates)"><Input value={v.businessAccountId} placeholder="WABA id from WhatsApp Manager" onChange={(e) => setV({ ...v, businessAccountId: e.target.value })} /></Field>
            <Field label={`Access token ${initial.hasToken ? "(saved - leave blank to keep)" : ""}`}>
              <Input type="password" value={v.accessToken} placeholder={initial.hasToken ? "••••••••" : ""} onChange={(e) => setV({ ...v, accessToken: e.target.value })} />
            </Field>
            <Field label="API version"><Input value={v.apiVersion} placeholder="v21.0" onChange={(e) => setV({ ...v, apiVersion: e.target.value })} /></Field>
            <Field label="Default country code"><Input value={v.defaultCountryCode} placeholder="91" onChange={(e) => setV({ ...v, defaultCountryCode: e.target.value })} /></Field>
          </div>
          <p className="text-xs text-[var(--muted-foreground)]">
            The token is a permanent WhatsApp Cloud API access token. Default country code is prepended to
            local mobiles (e.g. a 10-digit Indian number) so WhatsApp gets a full international number. The
            <strong> Business Account ID</strong> (WABA id, from Meta WhatsApp Manager) is only needed to load
            your approved templates on the Nurture page - the token must have <strong>whatsapp_business_management</strong>.
          </p>
          <div>
            <Button size="sm" onClick={save} disabled={pending}>Save WhatsApp settings</Button>
          </div>
        </div>
      ) : null}
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

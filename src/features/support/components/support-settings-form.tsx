"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  testSupportWebhook,
  updateSupportSettings,
  type SupportSettingsView,
} from "@/features/support/actions/settings";
import { SUPPORT_MODES, type SupportMode } from "@/lib/support/model";

const SELECT = "h-10 w-full rounded-md border bg-[var(--background)] px-3 text-sm text-[var(--foreground)]";

const MODE_LABEL: Record<SupportMode, string> = {
  IN_APP: "In-app, I answer it",
  EMAIL: "Email, forward to the support inbox",
  OFF: "Off, no new requests",
};

/**
 * How each support queue is handled.
 *
 * The switch exists because in-app support stops scaling before the product does: the
 * owner answers every thread at ten tenants and cannot at two hundred, and the first
 * thing to break is the badge, because a number nobody can clear is a number nobody
 * reads. EMAIL hands one queue over while the other stays in-app.
 *
 * 🟡 Flipping a queue to EMAIL forwards everything already open, once, and the result
 * SAYS how many went. Without that, the badge disappears while nobody has been emailed,
 * and the people waiting are waiting on a screen nobody looks at any more.
 */
export function SupportSettingsForm({ initial }: { initial: SupportSettingsView }) {
  const [support, setSupport] = useState<SupportMode>(initial.support);
  const [onboarding, setOnboarding] = useState<SupportMode>(initial.onboarding);
  const [inboxEmail, setInboxEmail] = useState(initial.inboxEmail);
  const [webhookUrl, setWebhookUrl] = useState(initial.webhookUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [testMsg, setTestMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const movingToEmail =
    (support === "EMAIL" && initial.support !== "EMAIL") ||
    (onboarding === "EMAIL" && initial.onboarding !== "EMAIL");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="support-mode">Tickets</Label>
          <select
            id="support-mode"
            className={SELECT}
            value={support}
            onChange={(e) => setSupport(e.target.value as SupportMode)}
          >
            {SUPPORT_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="onboarding-mode">Onboarding support</Label>
          <select
            id="onboarding-mode"
            className={SELECT}
            value={onboarding}
            onChange={(e) => setOnboarding(e.target.value as SupportMode)}
          >
            {SUPPORT_MODES.map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="support-inbox">Support inbox</Label>
        <Input
          id="support-inbox"
          placeholder="support@yourdomain.com"
          value={inboxEmail}
          onChange={(e) => setInboxEmail(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Where email mode forwards to, with the customer as the reply address, so hitting Reply
          reaches them and not us. Also where the new-request alert goes in in-app mode.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="support-webhook">Reply webhook (your CRM)</Label>
        <Input
          id="support-webhook"
          placeholder="https://... Blank = nothing is posted"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          One POST per reply, in in-app mode only. This app sends no WhatsApp itself: your CRM holds
          the approved templates, the opt-in state and the sending number, so it gets the facts and
          decides what to send.
        </p>
      </div>

      <div className="rounded-md border p-3">
        <p className="text-sm font-medium">What gets posted</p>
        <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-[var(--muted)] p-3 text-[11px] leading-relaxed">
{`{
  "event_type": "support_reply",
  "reference": "AS-1042",
  "kind": "SUPPORT",
  "request_id": "clz...",
  "topic": "My funnel is not collecting leads",
  "subject": "Submissions stopped arriving",
  "thread_url": "https://.../w/support/clz...",
  "tenant_id": "clz...",
  "tenant_name": "Acme Clinic",
  "contact_name": "Deepak",
  "contact_email": "deepak@acme.com",
  "contact_phone": "+919999999999",
  "reply_body": "Fixed, try again.",
  "reply_at": "2026-10-09T18:30:00.000Z",
  "test": false
}`}
        </pre>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          contact_name, contact_email and contact_phone are the keys your CRM automations already
          map. contact_phone is null until that login saves a number, so handle the blank. test is
          true only for the button below, which is there so a test never messages anybody.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            variant="outline"
            disabled={pending || !webhookUrl.trim()}
            onClick={() => {
              setTestMsg(null);
              start(async () => {
                const r = await testSupportWebhook(webhookUrl);
                setTestMsg(r.ok ? "🟢 Your CRM accepted it." : `🟡 ${r.error}`);
              });
            }}
          >
            {pending ? "Posting..." : "Send a test"}
          </Button>
          {testMsg ? <span className="text-sm text-[var(--muted-foreground)]">{testMsg}</span> : null}
        </div>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Worth doing once. A URL with a typo in it breaks nothing you can see: the reply email still
          goes and the thread still says answered, and the only symptom is a WhatsApp that never
          arrived.
        </p>
      </div>

      {movingToEmail ? (
        <p className="rounded-md border border-amber-500/60 bg-amber-500/5 p-3 text-sm">
          🟡 Saving this forwards every thread that is still open and has never been forwarded, once,
          and tells you how many went. Those customers are then told to watch their email.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await updateSupportSettings({ support, onboarding, inboxEmail, webhookUrl });
              if (!r.ok) {
                setMsg(r.error);
                return;
              }
              const n = r.data?.forwarded ?? 0;
              setMsg(n > 0 ? `Saved. ${n} open thread${n === 1 ? "" : "s"} forwarded.` : "Saved.");
            });
          }}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}

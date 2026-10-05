"use client";

import { useState, useTransition } from "react";
import {
  updateWelcomeEmail,
  sendWelcomeTest,
  type WelcomeEmailView,
} from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * The welcome email a new workspace receives at signup.
 *
 * Off until the owner turns it on, and testable before that: the test button sends the
 * exact template through the exact renderer a real signup uses, so "it looked fine in
 * the box" is never the last check before a customer sees it.
 */
export function WelcomeEmailForm({ initial }: { initial: WelcomeEmailView }) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateWelcomeEmail(enabled, subject, body);
      setMsg(r.ok ? "Saved." : r.error);
    });

  const test = () =>
    start(async () => {
      setMsg(null);
      const r = await sendWelcomeTest(to);
      setMsg(r.ok ? `Sent to ${to}.` : r.error);
    });

  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        Send this when a new workspace is created
      </label>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Subject</Label>
        <Input
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder={initial.defaultSubject}
        />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Body (HTML allowed)</Label>
        <Textarea
          className="min-h-56 font-mono text-xs"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={initial.defaultBody}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Leave either blank to use the built-in copy. Placeholders:{" "}
          <code>{"{{name}}"}</code> <code>{"{{email}}"}</code> <code>{"{{workspaceUrl}}"}</code>{" "}
          <code>{"{{signInUrl}}"}</code> <code>{"{{resetUrl}}"}</code>.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          🔴 There is no password placeholder. A new signup chose their own password, and a
          password in an email is a copy of the account in every inbox it passes through.
          <code>{"{{resetUrl}}"}</code> sends them to set a new one, which is what they
          actually need.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save welcome email"}
        </Button>
        <Input
          className="w-56"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="you@example.com"
        />
        <Button size="sm" variant="outline" onClick={test} disabled={pending}>
          Send test
        </Button>
        {msg ? <span className="text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Save first, then test: the test sends what is stored, not what is on screen. It goes
        out through the platform sender configured in Settings.
      </p>
    </div>
  );
}

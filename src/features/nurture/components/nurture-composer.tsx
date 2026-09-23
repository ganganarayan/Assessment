"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { NURTURE_PLACEHOLDERS, type NurtureConfig } from "@/features/nurture/config";
import { formatIST } from "@/lib/date";
import {
  updateNurtureConfig,
  sendTestEmail,
  sendTestWaba,
  type NurtureLogRow,
} from "@/features/nurture/actions";

/**
 * Nurture message composer — the single Email + WhatsApp that fire once on opt-in.
 * Email on top, WhatsApp below. Connection credentials live in Settings; this page is
 * only the message content, test sends and the send log.
 */
export function NurtureComposer({
  initialConfig,
  initialLogs,
}: {
  initialConfig: NurtureConfig;
  initialLogs: NurtureLogRow[];
}) {
  const router = useRouter();
  const [cfg, setCfg] = useState<NurtureConfig>(initialConfig);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const setEmail = (patch: Partial<NurtureConfig["email"]>) => setCfg((c) => ({ ...c, email: { ...c.email, ...patch } }));
  const setWaba = (patch: Partial<NurtureConfig["waba"]>) => setCfg((c) => ({ ...c, waba: { ...c.waba, ...patch } }));

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updateNurtureConfig(cfg);
      setMsg(r.ok ? "Nurture messages saved." : r.error);
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        These fire <strong>once, as soon as a respondent completes the assessment</strong>. Use{" "}
        <strong>{"{{resultUrl}}"}</strong> to send the person their personal result link. Set the
        SMTP + WhatsApp connection in <a className="underline" href="/admin/settings">Settings</a> first.
        Placeholders: {NURTURE_PLACEHOLDERS.map((p) => `{{${p}}}`).join("  ")}
      </p>

      {/* Email — top */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cfg.email.enabled} onChange={(e) => setEmail({ enabled: e.target.checked })} />
          Email — send on completion
        </label>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Subject</Label>
          <Input value={cfg.email.subject} placeholder="Welcome, {{firstName}} — your results are on the way" onChange={(e) => setEmail({ subject: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Body (HTML allowed)</Label>
          <Textarea rows={7} value={cfg.email.body} placeholder={"<p>Hi {{firstName}},</p>\n<p>Your results are ready — view them here:</p>\n<p><a href=\"{{resultUrl}}\">{{resultUrl}}</a></p>"} onChange={(e) => setEmail({ body: e.target.value })} spellCheck={false} />
        </div>
        <TestSend kind="email" />
      </section>

      {/* WhatsApp — below */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" checked={cfg.waba.enabled} onChange={(e) => setWaba({ enabled: e.target.checked })} />
          WhatsApp — send on completion
        </label>
        <p className="text-xs text-[var(--muted-foreground)]">
          WhatsApp business-initiated messages must use a <strong>pre-approved template</strong> from your
          Meta WhatsApp account. Enter its exact name + language, then map its body variables
          (&#123;&#123;1&#125;&#125;, &#123;&#123;2&#125;&#125;…) below — each can be plain text or a placeholder.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Template name</Label>
            <Input value={cfg.waba.template} placeholder="welcome_assessment" onChange={(e) => setWaba({ template: e.target.value })} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">Language code</Label>
            <Input value={cfg.waba.lang} placeholder="en" onChange={(e) => setWaba({ lang: e.target.value })} />
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Body variables (in order)</Label>
          {cfg.waba.vars.map((val, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="w-10 text-xs text-[var(--muted-foreground)]">{`{{${i + 1}}}`}</span>
              <Input value={val} placeholder="{{firstName}}" onChange={(e) => setWaba({ vars: cfg.waba.vars.map((x, idx) => (idx === i ? e.target.value : x)) })} />
              <Button size="sm" variant="ghost" onClick={() => setWaba({ vars: cfg.waba.vars.filter((_, idx) => idx !== i) })}>✕</Button>
            </div>
          ))}
          <div>
            <Button size="sm" variant="outline" onClick={() => setWaba({ vars: [...cfg.waba.vars, ""] })}>+ Add variable</Button>
          </div>
        </div>
        <TestSend kind="waba" />
      </section>

      <div className="flex items-center gap-3">
        <Button onClick={save} disabled={pending}>Save nurture messages</Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>

      {/* Send log */}
      <section className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">Recent sends</h2>
          <Button size="sm" variant="ghost" onClick={() => router.refresh()}>Refresh</Button>
        </div>
        {initialLogs.length === 0 ? (
          <p className="text-xs text-[var(--muted-foreground)]">No sends yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-left text-xs">
              <thead className="bg-[var(--muted)]/40 text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-2">When</th>
                  <th className="px-3 py-2">Channel</th>
                  <th className="px-3 py-2">To</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Link clicked</th>
                  <th className="px-3 py-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {initialLogs.map((r) => (
                  <tr key={r.id} className="border-t border-[var(--border)]">
                    <td className="whitespace-nowrap px-3 py-2">{new Date(r.createdAt).toLocaleString()}</td>
                    <td className="px-3 py-2">{r.channel}</td>
                    <td className="break-all px-3 py-2">{r.toAddress ?? "—"}</td>
                    <td className="px-3 py-2">
                      <span className={r.status === "SENT" ? "text-green-600" : r.status === "FAILED" ? "text-red-600" : "text-[var(--muted-foreground)]"}>
                        {r.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {r.channel === "EMAIL" && r.status === "SENT" ? (
                        r.clickedAt ? (
                          <span className="text-green-600">✓, {formatIST(r.clickedAt)}</span>
                        ) : (
                          <span className="text-red-600" title="No tracked link clicked yet">✗</span>
                        )
                      ) : (
                        <span className="text-[var(--muted-foreground)]" title="Click tracking applies to sent emails only">—</span>
                      )}
                    </td>
                    <td className="max-w-[280px] break-words px-3 py-2 text-[var(--muted-foreground)]">{r.error ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );

  function TestSend({ kind }: { kind: "email" | "waba" }) {
    const [to, setTo] = useState("");
    const [result, setResult] = useState<string | null>(null);
    const [busy, startTest] = useTransition();
    const run = () =>
      startTest(async () => {
        setResult(null);
        const r = kind === "email" ? await sendTestEmail(to) : await sendTestWaba(to);
        setResult(r.ok ? "Sent ✓" : r.error);
        router.refresh();
      });
    return (
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Input
          className="max-w-xs"
          value={to}
          placeholder={kind === "email" ? "you@example.com" : "9876543210"}
          onChange={(e) => setTo(e.target.value)}
        />
        <Button size="sm" variant="outline" onClick={run} disabled={busy || !to.trim()}>
          Send test {kind === "email" ? "email" : "WhatsApp"}
        </Button>
        {result ? <span className="text-xs text-[var(--muted-foreground)]">{result}</span> : null}
      </div>
    );
  }
}

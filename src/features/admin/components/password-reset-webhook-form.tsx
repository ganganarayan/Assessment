"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updatePasswordResetWebhook } from "@/features/admin/actions/platform-integrations";

export function PasswordResetWebhookForm({ initialUrl }: { initialUrl: string }) {
  const [url, setUrl] = useState(initialUrl);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setMsg(null);
      const r = await updatePasswordResetWebhook(url);
      setMsg(r.ok ? "Saved." : r.error);
    });

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="pwreset" className="text-xs">Password reset webhook URL</Label>
      <Input id="pwreset" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://your-crm.example.com/webhooks/password-reset" />
      <p className="text-xs text-[var(--muted-foreground)]">
        On &ldquo;Forgot password&rdquo;, assess360 POSTs{" "}
        <span className="font-mono">{`{type:"password_reset", email, name, reset_url, token}`}</span> here; your CRM emails
        the user the <span className="font-mono">reset_url</span>. The link expires in 10 minutes. Blank = use the
        env fallback.
      </p>
      <div><Button size="sm" onClick={save} disabled={pending}>Save reset webhook</Button></div>
      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

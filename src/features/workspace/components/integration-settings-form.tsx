"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { type IntegrationSettingsView } from "@/features/workspace/actions/integrations";

type SaveResult = { ok: boolean; error?: string };
type SaveMeta = (pixelId: string, capiToken: string) => Promise<SaveResult>;
type SaveRazorpay = (keyId: string, keySecret: string, webhookSecret: string) => Promise<SaveResult>;

/**
 * Shared Meta + Razorpay key editor. The SAVE actions are injected so the same form
 * drives three scopes: a tenant workspace, a super admin impersonating a tenant
 * (both use the per-tenant actions), and the platform/Gita singleton (platform
 * actions). Secrets are write-only — never round-tripped to the client.
 */
export function IntegrationSettingsForm({
  initial,
  saveMetaAction,
  saveRazorpayAction,
  banner,
}: {
  initial: IntegrationSettingsView;
  saveMetaAction: SaveMeta;
  saveRazorpayAction: SaveRazorpay;
  banner?: string;
}) {
  const [pixelId, setPixelId] = useState(initial.metaPixelId);
  const [capiToken, setCapiToken] = useState("");
  const [keyId, setKeyId] = useState(initial.razorpayKeyId);
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const saveMeta = () =>
    start(async () => {
      setMsg(null);
      const r = await saveMetaAction(pixelId, capiToken);
      setMsg(r.ok ? "Meta settings saved." : r.error ?? "Something went wrong.");
      if (r.ok) setCapiToken("");
    });

  const saveRazorpay = () =>
    start(async () => {
      setMsg(null);
      const r = await saveRazorpayAction(keyId, keySecret, webhookSecret);
      setMsg(r.ok ? "Razorpay settings saved." : r.error ?? "Something went wrong.");
      if (r.ok) {
        setKeySecret("");
        setWebhookSecret("");
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border-l-2 border-green-500 bg-green-500/5 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        {banner ??
          "These keys are live for this workspace: your funnel fires your own Meta pixel, the Conversions API sends with your token, and payments run on your Razorpay account. Secrets are encrypted and never shown again."}
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Meta Pixel ID</Label>
          <Input value={pixelId} onChange={(e) => setPixelId(e.target.value)} placeholder="e.g. 1129238316012161" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Meta CAPI access token {initial.hasCapiToken ? <span className="text-green-600">(saved — leave blank to keep)</span> : null}
          </Label>
          <Input
            type="password"
            value={capiToken}
            onChange={(e) => setCapiToken(e.target.value)}
            placeholder={initial.hasCapiToken ? "••••••••" : "Paste your Conversions API token"}
          />
        </div>
        <div>
          <Button size="sm" onClick={saveMeta} disabled={pending}>Save Meta settings</Button>
        </div>
      </div>

      {/* Razorpay */}
      <div className="flex flex-col gap-3 border-t pt-4">
        <p className="text-sm font-medium">Razorpay</p>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Key ID</Label>
          <Input value={keyId} onChange={(e) => setKeyId(e.target.value)} placeholder="rzp_live_..." />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Key secret {initial.hasRazorpaySecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input type="password" value={keySecret} onChange={(e) => setKeySecret(e.target.value)} placeholder={initial.hasRazorpaySecret ? "••••••••" : "Key secret"} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            Webhook secret {initial.hasRazorpayWebhookSecret ? <span className="text-green-600">(saved)</span> : null}
          </Label>
          <Input type="password" value={webhookSecret} onChange={(e) => setWebhookSecret(e.target.value)} placeholder={initial.hasRazorpayWebhookSecret ? "••••••••" : "Webhook signing secret"} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Webhook URL (point Razorpay → Settings → Webhooks here)</Label>
          <Input readOnly value={initial.webhookUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <p className="text-xs text-[var(--muted-foreground)]">Events: payment.captured and payment_link.paid.</p>
        </div>
        <div>
          <Button size="sm" onClick={saveRazorpay} disabled={pending}>Save Razorpay settings</Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

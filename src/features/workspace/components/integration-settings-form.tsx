"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  updateMetaSettings,
  updateRazorpaySettings,
  type IntegrationSettingsView,
} from "@/features/workspace/actions/integrations";

export function IntegrationSettingsForm({ initial }: { initial: IntegrationSettingsView }) {
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
      const r = await updateMetaSettings(pixelId, capiToken);
      setMsg(r.ok ? "Meta settings saved." : r.error);
      if (r.ok) setCapiToken("");
    });

  const saveRazorpay = () =>
    start(async () => {
      setMsg(null);
      const r = await updateRazorpaySettings(keyId, keySecret, webhookSecret);
      setMsg(r.ok ? "Razorpay settings saved." : r.error);
      if (r.ok) {
        setKeySecret("");
        setWebhookSecret("");
      }
    });

  return (
    <div className="flex flex-col gap-6">
      <div className="rounded-lg border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs text-[var(--muted-foreground)]">
        Stored securely for when per-workspace ad tracking + payments go live. Saving your keys
        here does not yet redirect firing — that connection is being finalized.
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
        <div>
          <Button size="sm" onClick={saveRazorpay} disabled={pending}>Save Razorpay settings</Button>
        </div>
      </div>

      {msg ? <p className="text-sm text-[var(--muted-foreground)]">{msg}</p> : null}
    </div>
  );
}

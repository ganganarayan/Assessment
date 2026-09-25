"use client";

import { useState, useTransition } from "react";
import { updatePlatformSubscriptionPixel } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function PlatformPixelForm({ initial }: { initial: { pixelId: string; hasCapiToken: boolean } }) {
  const [pixelId, setPixelId] = useState(initial.pixelId);
  const [capiToken, setCapiToken] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updatePlatformSubscriptionPixel(pixelId, capiToken);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
      if (res.ok) setCapiToken("");
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="platform-pixel-id">Meta Pixel ID</Label>
        <Input
          id="platform-pixel-id"
          inputMode="numeric"
          placeholder="e.g. 1234567890123456"
          value={pixelId}
          onChange={(e) => setPixelId(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor="platform-capi-token">Conversions API token</Label>
        <Input
          id="platform-capi-token"
          type="password"
          autoComplete="off"
          placeholder={initial.hasCapiToken ? "•••••••• (saved — leave blank to keep)" : "Paste the CAPI access token"}
          value={capiToken}
          onChange={(e) => setCapiToken(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          A SEPARATE pixel from the Gita assessment one. It fires the SaaS funnel:
          PageView on the landing page, CompleteRegistration on free sign-up, and Purchase
          on a subscription. The token is encrypted and never shown again; leave it blank to
          keep the saved one.
        </p>
      </div>
      {msg ? <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p> : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

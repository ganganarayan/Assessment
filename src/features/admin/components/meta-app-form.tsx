"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateMetaAppSettings } from "@/features/admin/actions/meta-app";
import { type MetaAppSettingsView } from "@/features/whatsapp/types";

/**
 * The owner's one-time setup for one-click WhatsApp.
 *
 * Four values, all of them from developers.facebook.com and none from Business
 * settings - which matters, because Business settings is where a second full-control
 * admin has to approve things. Filling this in is the only Meta work that is ours;
 * after it, every tenant and client connects their own number by clicking a button.
 */
export function MetaAppForm({ initial }: { initial: MetaAppSettingsView }) {
  const [v, setV] = useState({
    appId: initial.appId,
    appSecret: "",
    configId: initial.configId,
    verifyToken: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const live = !!initial.appId && initial.hasSecret && !!initial.configId;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm">
        {live ? "🟢 One-click WhatsApp is live for every workspace." : "🟡 Not live yet. All three of app id, app secret and configuration id are needed."}
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-app-id">App id</Label>
          <Input
            id="meta-app-id"
            inputMode="numeric"
            placeholder="From App Dashboard > Settings > Basic"
            value={v.appId}
            onChange={(e) => setV({ ...v, appId: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-app-secret">App secret {initial.hasSecret ? "(saved - leave blank to keep)" : ""}</Label>
          <Input
            id="meta-app-secret"
            type="password"
            placeholder={initial.hasSecret ? "••••••••" : "From the same page"}
            value={v.appSecret}
            onChange={(e) => setV({ ...v, appSecret: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-config-id">Embedded Signup configuration id</Label>
          <Input
            id="meta-config-id"
            inputMode="numeric"
            placeholder="Facebook Login for Business > Configurations"
            value={v.configId}
            onChange={(e) => setV({ ...v, configId: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="meta-verify-token">
            Webhook verify token {initial.hasVerifyToken ? "(saved - leave blank to keep)" : ""}
          </Label>
          <Input
            id="meta-verify-token"
            type="password"
            placeholder={initial.hasVerifyToken ? "••••••••" : "Invent any long random string"}
            value={v.verifyToken}
            onChange={(e) => setV({ ...v, verifyToken: e.target.value })}
          />
        </div>
      </div>

      <div className="rounded-md border border-dashed p-3 text-xs text-[var(--muted-foreground)]">
        <p className="font-medium text-[var(--foreground)]">Paste this into the Meta app as the callback URL</p>
        <p className="mt-1 break-all">{initial.webhookUrl}</p>
        <p className="mt-2">
          Use the same verify token on both sides. Subscribe the app to{" "}
          <strong>account_update</strong>, <strong>history</strong>,{" "}
          <strong>smb_app_state_sync</strong> and <strong>smb_message_echoes</strong>. All four are
          required before Meta will let a business keep its number on the phone app, and nothing
          here can tick them for you. Graph version in use: {initial.graphVersion}.
        </p>
        <p className="mt-2">
          🔴 The configuration must be created new: selecting products in Facebook Login for Business
          sets it to Embedded Signup v4, and v2 was retired on 15-10-2026.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await updateMetaAppSettings(v);
              setMsg(r.ok ? "Saved." : r.error);
              if (r.ok) setV({ ...v, appSecret: "", verifyToken: "" });
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

"use client";

import { useState, useTransition } from "react";
import { updateSupportEmail } from "@/features/workspace/actions/support";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SupportSettingsForm({ initial }: { initial: string }) {
  const [email, setEmail] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateSupportEmail(email);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="support-email">Support email</Label>
        <Input
          id="support-email"
          type="email"
          inputMode="email"
          placeholder="support@yourbrand.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Shown to respondents if results can&apos;t be displayed (for example, when your
          plan&apos;s monthly response limit is reached). Leave blank to hide the address.
        </p>
      </div>
      {msg ? (
        <p className={`text-sm ${msg.ok ? "text-green-600" : "text-red-500"}`}>{msg.text}</p>
      ) : null}
      <div>
        <Button size="sm" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
      </div>
    </div>
  );
}

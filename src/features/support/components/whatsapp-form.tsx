"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveMyWhatsapp } from "@/features/support/actions/tenant";

/**
 * The number support replies are sent to.
 *
 * On the LOGIN, not the workspace. The person who raised the ticket is the person who
 * wants telling it was answered, and a workspace with two logins has two people with two
 * phones. Blank is a perfectly good answer and means email only, which the ticket form
 * says out loud rather than quietly dropping half the notification.
 *
 * The number is PASSED ON, never dialled from here: it rides along with the reply to the
 * support CRM, which owns the templates and the sending number. Nothing in this app
 * messages it.
 */
export function SupportWhatsappForm({ initial }: { initial: string }) {
  const [whatsapp, setWhatsapp] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="my-whatsapp">Your WhatsApp number</Label>
        <Input
          id="my-whatsapp"
          placeholder="Blank = email only"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          With the country code. Used for one thing only: so support can message you when there is a
          reply waiting on a thread you opened. Leave it blank and they will email instead.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await saveMyWhatsapp(whatsapp);
              setMsg(r.ok ? "Saved." : r.error);
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

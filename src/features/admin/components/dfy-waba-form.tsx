"use client";

import { useState, useTransition } from "react";
import { updateDfyWabaTemplate } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The WhatsApp template fired when somebody submits the /build intake.
 *
 * Blank is the shipping state and a perfectly good one: no WhatsApp is sent, the
 * confirmation email still goes, and nothing fails. A template has to be submitted and
 * approved inside Meta Business Manager first, which is an account action that cannot be
 * done from here - so this field exists to receive the approved name afterwards rather
 * than to create anything.
 */
export function DfyWabaForm({
  initialTemplate,
  initialLang,
}: {
  initialTemplate: string;
  initialLang: string;
}) {
  const [template, setTemplate] = useState(initialTemplate);
  const [lang, setLang] = useState(initialLang || "en");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="dfy-waba-template">Approved template name</Label>
          <Input
            id="dfy-waba-template"
            placeholder="Blank sends no WhatsApp"
            value={template}
            onChange={(e) => setTemplate(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="dfy-waba-lang">Language code</Label>
          <Input id="dfy-waba-lang" value={lang} onChange={(e) => setLang(e.target.value)} />
        </div>
      </div>

      <p className="text-sm text-[var(--muted-foreground)]">
        {template.trim() ? (
          <>
            Submissions will fire this template with <strong className="text-[var(--foreground)]">one
            variable, the business name</strong>. A template approved with a different number of
            variables will be rejected by Meta, so check it matches.
          </>
        ) : (
          <>
            No WhatsApp is sent. The confirmation email still goes. Approve a template in Meta
            Business Manager first, then paste its exact name here.
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await updateDfyWabaTemplate(template, lang);
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

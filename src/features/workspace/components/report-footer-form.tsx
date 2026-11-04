"use client";

import { useState, useTransition } from "react";
import { updateReportFooter } from "@/features/workspace/actions/report-footer";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export function ReportFooterForm({ initial, canEdit }: { initial: string; canEdit: boolean }) {
  const [footer, setFooter] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (!canEdit) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Your plan prints &ldquo;Report by Assess360&rdquo; at the foot of every PDF. Signal and above
        remove it and can print your own footer instead.
      </p>
    );
  }

  function save() {
    setMsg(null);
    start(async () => {
      const res = await updateReportFooter(footer);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor="report-footer">PDF footer</Label>
        <Textarea
          id="report-footer"
          rows={3}
          placeholder={"Your business name\nyourbrand.com · hello@yourbrand.com"}
          value={footer}
          onChange={(e) => setFooter(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          Each line prints at the foot of every page of your PDF reports. Leave it blank to print
          nothing.
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

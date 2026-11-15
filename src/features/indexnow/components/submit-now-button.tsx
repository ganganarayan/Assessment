"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { submitAllPagesNow } from "@/features/indexnow/actions";

export function SubmitNowButton({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <Button
        type="button"
        disabled={!enabled || pending}
        onClick={() =>
          start(async () => {
            const res = await submitAllPagesNow();
            const sent = res.summary.reduce((n, s) => n + s.sent, 0);
            const failed = res.summary.filter((s) => s.status !== null && s.status !== 200 && s.status !== 202).length;
            setMessage(failed ? `🟡 Sent ${sent} pages, ${failed} batch(es) failed. See the log below.` : `🟢 Sent ${sent} pages.`);
          })
        }
      >
        {pending ? "Submitting..." : "Submit all pages now"}
      </Button>
      {!enabled ? <p className="text-sm text-[var(--muted-foreground)]">Only production sends to search engines. This environment never does.</p> : null}
      {message ? <p className="text-sm">{message}</p> : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resendNotification } from "@/features/support/actions/platform";

/**
 * Send a failed notification again.
 *
 * It resends THE SAME message rather than opening a box, so the customer can never
 * receive two different versions of one reply. This is the whole reason sending is inline
 * and best effort instead of queued: a failure that is visible next to the reply, with a
 * button on it, beats a retry queue somebody has to remember to go and read.
 */
export function ResendButton({ messageId }: { messageId: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <span className="inline-flex items-center gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setMsg(null);
            const r = await resendNotification(messageId);
            setMsg(r.ok ? "Sent." : r.error);
            router.refresh();
          })
        }
      >
        {pending ? "Sending..." : "Resend"}
      </Button>
      {msg ? <span>{msg}</span> : null}
    </span>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { replyAsTenant } from "@/features/support/actions/tenant";

/**
 * The customer adds something to their own thread.
 *
 * It puts the thread back on the owner's badge, which is the point: a customer who comes
 * back to a resolved thread with "it is happening again" must not be answered by silence
 * because the status said finished.
 */
export function TenantReplyBox({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [body, setBody] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tenant-reply">Add to this thread</Label>
      <Textarea
        id="tenant-reply"
        rows={4}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Anything else that would help, or an answer to what support asked."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={pending || !body.trim()}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await replyAsTenant({ requestId, body });
              if (r.ok) {
                setBody("");
                router.refresh();
              }
              setMsg(r.ok ? "Sent." : r.error);
            });
          }}
        >
          {pending ? "Sending..." : "Send"}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}

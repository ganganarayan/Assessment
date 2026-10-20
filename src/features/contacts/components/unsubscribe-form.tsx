"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { unsubscribeByToken } from "@/features/contacts/actions-public";

/**
 * The button that actually stops the messages.
 *
 * A button and not a link, because the page it sits on is reached by a URL in an email
 * and mail scanners fetch those URLs before anybody reads them. A click is the only
 * signal here that came from a person.
 */
export function UnsubscribeForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (done) {
    return (
      <p className="text-sm font-medium">
        🟢 Done. You are unsubscribed, and nothing further will be sent.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Button
        size="lg"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await unsubscribeByToken(token);
            if (r.ok) setDone(true);
            else setError(r.error);
          })
        }
      >
        {pending ? "Unsubscribing..." : "Unsubscribe me"}
      </Button>
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlatformWaba } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";

/**
 * A platform-wide on/off, for the switches that govern every tenant at once.
 *
 * Generic over which switch it drives so the next one does not arrive as a third
 * near-identical component. The action is named rather than passed as a function
 * because a Server Action cannot be handed to a client component as a prop.
 */
export function PlatformToggle({
  initial,
  onLabel,
  offLabel,
  turnOn,
  turnOff,
  action,
}: {
  initial: boolean;
  /** How the current state reads when on, e.g. "visible to every tenant". */
  onLabel: string;
  offLabel: string;
  /** Button text when currently OFF (i.e. the action turns it on). */
  turnOn: string;
  turnOff: string;
  action: "waba";
}) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      setMsg(null);
      const next = !on;
      const res = action === "waba" ? await setPlatformWaba(next) : { ok: false, error: "Unknown switch." };
      if (!res.ok) {
        setMsg("error" in res ? res.error : "Could not change that.");
        return;
      }
      setOn(next);
      setMsg("Saved.");
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="text-sm">
        Currently <strong className={on ? "text-green-600" : "text-amber-600"}>{on ? onLabel : offLabel}</strong>.
      </span>
      <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
        {pending ? "Saving…" : on ? turnOff : turnOn}
      </Button>
      {msg ? <span className="text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
    </div>
  );
}

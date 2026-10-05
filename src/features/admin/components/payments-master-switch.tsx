"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setPlatformPayments } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";

/**
 * The platform master switch for RESPONDENT payments.
 *
 * Off means no tenant funnel anywhere can take money, whatever that tenant's own
 * switch or its assessments say. It is the one lever that stops all of it without
 * editing a single tenant, which is the point: the owner is not underwriting how
 * other people collect payments and needs to be able to say no once.
 */
export function PaymentsMasterSwitch({ initial }: { initial: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggle = () =>
    start(async () => {
      setMsg(null);
      const next = !on;
      const r = await setPlatformPayments(next);
      if (!r.ok) {
        setMsg(r.error);
        return;
      }
      setOn(next);
      setMsg("Saved.");
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm">
          Currently{" "}
          <strong className={on ? "text-green-600" : "text-amber-600"}>
            {on ? "on for every tenant" : "off for every tenant"}
          </strong>
          .
        </span>
        <Button size="sm" variant="outline" onClick={toggle} disabled={pending}>
          {pending ? "Saving…" : on ? "Turn payments off everywhere" : "Turn payments on"}
        </Button>
        {msg ? <span className="text-xs text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
      <p className="text-xs text-[var(--muted-foreground)]">
        Turning this off does not delete anything. Funnels that charge simply run free until
        it is switched back on, so nobody meets a payment screen that then refuses. Individual
        tenants can also be switched off one at a time in the platform console.
      </p>
    </div>
  );
}

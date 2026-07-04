"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exitTenant } from "@/features/platform/actions";

/** Shown across the workspace when a super admin has "entered" a tenant. */
export function ImpersonationBanner({ tenantName }: { tenantName: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <span>
        Acting as tenant <strong>{tenantName}</strong> — super-admin impersonation.
      </span>
      <Button size="sm" variant="outline" disabled={pending} onClick={() => start(async () => { await exitTenant(); })}>
        Exit to platform
      </Button>
    </div>
  );
}

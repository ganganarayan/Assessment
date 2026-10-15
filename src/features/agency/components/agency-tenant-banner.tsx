"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { exitAgencyTenant } from "@/features/agency/actions";

/**
 * The strip an AGENCY ADMIN sees while they are inside one of their client workspaces.
 *
 * It exists for one reason: everything else on the screen looks exactly like their own
 * workspace, so without it the next thing they build lands in a client's account and
 * they find out later. The way back is a button rather than a link to the list, because
 * leaving is a state change (the acting cookie), not a page.
 */
export function AgencyTenantBanner({ tenantName }: { tenantName: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-[var(--muted)] px-4 py-2 text-sm md:px-8">
      <span>
        You are working in <strong>{tenantName}</strong>, one of your client workspaces.
        Anything you create here belongs to them.
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() => start(async () => { await exitAgencyTenant(); })}
      >
        {pending ? "Leaving..." : "Back to my workspace"}
      </Button>
    </div>
  );
}

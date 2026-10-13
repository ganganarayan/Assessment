import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { SlotPurchase } from "@/features/billing/components/slot-purchase";
import { getAgencyTenantsView } from "@/features/agency/actions";
import { AgencyTenantManager } from "@/features/agency/components/agency-tenant-manager";

export const dynamic = "force-dynamic";

/**
 * Client workspaces - what an AGENCY ADMIN runs for the people who hire them.
 *
 * The nav link is hidden unless the plan includes any (see the workspace layout), but
 * the page still explains itself to a caller who arrives without the allowance: a hidden
 * link is presentation, and this route is reachable by typing it.
 *
 * 🟡 Vocabulary, deliberately split. In the schema, the gates and support, these are
 * AGENCY TENANTS, which is the owner's word and the one that keeps code and
 * conversations aligned. On this screen they are "client workspaces", because the person
 * reading it is the agency and the workspaces are their clients'.
 */
export default async function AgencyTenantsPage() {
  await requireWorkspace();
  const [view, user] = await Promise.all([getAgencyTenantsView(), getCurrentUser()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Client workspaces</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One full workspace per client: its own scorecards, leads, ad account and pixel,
          its own webhooks, and its own domain if you give it one. You move between them
          with Enter, from this login, without passwords.
        </p>
      </div>

      {view.blocked === "platform" ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          Workspaces are managed from the platform console, not here.{" "}
          <Link href="/platform" className="underline">Open /platform</Link> to create one,
          or enter an agency&apos;s workspace to see theirs.
        </div>
      ) : null}

      {view.blocked === "nested" ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          This workspace belongs to an agency, so it cannot have workspaces of its own.
          Ask your agency for another one.
        </div>
      ) : null}

      {view.blocked === "notReselling" ? (
        <div className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
          {view.parkedMessage
            ? view.parkedMessage
            : "Your plan includes no client workspaces. Agency includes five, on top of this one, and each is a full workspace."}{" "}
          <Link href="/w/billing" className="underline">See plans</Link>.
        </div>
      ) : null}

      {view.blocked === "no" ? <AgencyTenantManager view={view} /> : null}

      {/* The buy button sits BELOW the list and its meter, not next to the cap warning:
          an agency admin at their limit should see what they already run, and the option
          to remove one, before they are offered a bigger bill. */}
      {view.blocked === "no" && view.canBuySlots ? (
        <SlotPurchase
          included={view.usage.included}
          extra={view.usage.extra}
          used={view.usage.used}
          priceUsd={view.extraPriceUsd}
          prefill={{ name: user?.name ?? "", email: user?.email ?? "" }}
        />
      ) : null}
    </div>
  );
}

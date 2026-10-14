import { requireWorkspace } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import Link from "next/link";
import { resolvePlan, getUsage } from "@/lib/billing/entitlements";
import { agencyTenantUsage } from "@/lib/billing/gate";
import { UsageMeters } from "@/features/billing/components/usage-meters";
import { PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, PLAN_PRICE_USD, TRIAL_PLAN, type PlanId } from "@/lib/billing/plans";
import { BillingPlans } from "@/features/billing/components/billing-plans";
import { CancelPlan } from "@/features/billing/components/cancel-plan";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const RANK: Record<PlanId, number> = { GATE: 0, SIGNAL: 1, AGENCY: 2, ENTERPRISE: 3 };

/** A short, human feature list per tier for the billing cards. */
function featuresFor(plan: PlanId): string[] {
  const l = PLAN_LIMITS[plan];
  const assessments = l.maxAssessments === null ? "Unlimited assessments" : `${l.maxAssessments} assessment${l.maxAssessments === 1 ? "" : "s"}`;
  const responses = l.responsesPerMonth === null ? "Unlimited responses" : `${l.responsesPerMonth.toLocaleString()} responses / mo`;
  const out = [assessments, responses];
  out.push("Disqualified visitors free, unmetered");
  // The two limits that are now enforced rather than published: a tenant deciding
  // whether to upgrade is usually standing in front of one of these walls.
  out.push(`${l.seats} user${l.seats === 1 ? "" : "s"} · ${l.adAccounts} ad account${l.adAccounts === 1 ? "" : "s"}`);
  // The reselling count, for the tiers that have one. Written as "plus", because the
  // workspace they are reading this in is free and uncounted - the number is what they
  // get ON TOP of it, and an agency admin who reads 5 as "including mine" will plan
  // their month wrong.
  if (l.agencyTenants > 0) {
    // 🔴 Said as "plus", and named separately from the ad accounts above, because the
    // two numbers are equal on Agency (5 and 5) and mean completely different things:
    // five ad accounts this workspace runs itself, and five SEPARATE workspaces with
    // their own logins. A reader who collapses them into one "5" plans their month
    // wrong. The workspace they are reading this in is free and not counted.
    out.push(`Plus ${l.agencyTenants} client workspaces, each with its own login, pixel and domain`);
  }
  out.push(`${l.customDomains} custom domain${l.customDomains === 1 ? "" : "s"}`);
  if (plan === "GATE") out.push("Qualification gate, CAPI, routing · badge shown");
  if (plan === "SIGNAL") out.push("Custom domain, AI reports, heatmap · badge removed");
  // 🔴 Said "sub-accounts, API" until 2026-10-13. Sub-accounts do not exist in the
  // product at all, and this card is shown to someone who is already PAYING for the
  // tier - the worst possible audience for a feature list that overstates it.
  if (plan === "AGENCY") out.push("Everything in Signal + bulk import, API tokens");
  if (plan === "ENTERPRISE") out.push("Negotiated caps · SSO, SLA by agreement");
  return out;
}

export default async function BillingPage() {
  const { tenantId } = await requireWorkspace();
  const [user, resolved, usage, agency] = await Promise.all([
    getCurrentUser(),
    resolvePlan(tenantId),
    // The numbers behind the plan cards. Shown ABOVE them: "what am I using" is the
    // question somebody opens this page with, and the ladder only means something once
    // they can see which rung they are pressed against.
    getUsage(tenantId),
    // The client-workspace meter. Resolved here rather than on the agency screen alone:
    // this is the page somebody opens when they are deciding whether to pay for one
    // more, so the count belongs next to the price.
    agencyTenantUsage(tenantId),
  ]);

  // The two facts the cancel control needs, which resolvePlan does not carry: when the
  // paid period ends, and whether a cancellation is already booked.
  const subRow = await prisma.subscription.findUnique({
    where: { tenantId },
    select: { currentPeriodEnd: true, cancelAtPeriodEnd: true, razorpaySubscriptionId: true, status: true },
  });

  /**
   * AN AGENCY TENANT HAS NO BILLING. The agency admin above it is the customer: one
   * subscription pays for all of their workspaces, and this one has no subscription row
   * of its own to show, change or cancel.
   *
   * The nav hides the link, and this is the route saying the same thing - reachable by
   * typing the URL, which is exactly how a client would find it.
   */
  if (resolved.agencyTenant) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            This workspace is managed by an agency, and they handle the plan for it.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4 text-sm">
          <p>
            Everything in here is included in what they pay: your scorecards, your leads,
            your ad account and pixel, your reports. There is nothing for you to buy and
            no card on file for this workspace.
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Need more responses, another scorecard or your own domain? Ask your agency -
            they can raise it or add another workspace.
          </p>
        </div>
      </div>
    );
  }

  // An INTERNAL workspace is not rated against the catalog, so there is no plan to show
  // and nothing to sell. `resolved.plan` is null here, and the old `?? "FREE"` turned
  // that into "You're on the Free plan" with live Upgrade buttons - the exact opposite
  // of the flag's meaning, and an invitation to buy a plan the tenant already exceeds.
  if (resolved.unlimited) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            This workspace is on an{" "}
            <span className="font-semibold text-[var(--foreground)]">internal unlimited</span> plan.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--border)] p-4">
          <p className="text-sm text-[var(--foreground)]">
            Unlimited assessments and responses, with every feature switched on. There is nothing to
            pay and no plan to upgrade to.
          </p>
          <p className="mt-2 text-xs text-[var(--muted-foreground)]">
            Set by the platform owner. To put this workspace back on a paid plan, clear the unlimited
            flag from the platform console.
          </p>
        </div>
      </div>
    );
  }

  // Parked or trialing: there is no purchased plan. Gate is the floor for the CARDS, so
  // the ladder renders with every tier marked as an upgrade.
  //
  // 🔴 It must not leak into the PROSE. This page used to print "You're on the Gate
  // plan" from this same value, which told a trialing tenant they were on a tier they
  // had never bought (and had more than) and told a parked tenant their funnel was live.
  // The sentence now comes from the resolved state; only the cards use the floor.
  const currentPlan: PlanId = resolved.plan ?? "GATE";
  const purchased = resolved.plan !== null && !resolved.trialing;

  const plans = PLAN_IDS.map((id) => ({
    id,
    name: PLAN_LABEL[id],
    priceUsd: PLAN_PRICE_USD[id],
    rank: RANK[id],
    features: featuresFor(id),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Billing</h1>
        {purchased ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            You&apos;re on the <span className="font-semibold text-[var(--foreground)]">{PLAN_LABEL[currentPlan]}</span> plan
            {resolved.status ? ` (${resolved.status.toLowerCase()})` : ""}. Upgrade any time - it takes effect right after payment.
          </p>
        ) : resolved.trialing ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            You&apos;re on the{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {resolved.trialDaysLeft}-day
            </span>{" "}
            remainder of your free trial, with every{" "}
            <span className="font-semibold text-[var(--foreground)]">{PLAN_LABEL[TRIAL_PLAN]}</span> feature switched
            on. Pick a plan whenever you like - nothing is charged until you do.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            This workspace has{" "}
            <span className="font-semibold text-[var(--foreground)]">no active plan</span> - the funnel is paused and
            your data is kept. Choosing a plan restarts it immediately.
          </p>
        )}
      </div>

      <UsageMeters usage={usage} />

      {agency.limit > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
          <span>
            <strong>{agency.used}</strong> of <strong>{agency.limit}</strong> client workspace
            {agency.limit === 1 ? "" : "s"} in use
            {agency.extra > 0 ? (
              <span className="text-[var(--muted-foreground)]">
                {" "}
                ({agency.included} on your plan, {agency.extra} added)
              </span>
            ) : null}
            <span className="text-[var(--muted-foreground)]"> · this workspace is free and not counted</span>
          </span>
          <Link href="/w/agency-tenants" className="underline">
            Manage
          </Link>
        </div>
      ) : null}

      <BillingPlans
        plans={plans}
        currentPlan={currentPlan}
        currentRank={RANK[currentPlan]}
        prefill={{ name: user?.name ?? "", email: user?.email ?? "" }}
      />

      {/* Only a live, paid subscription can be cancelled. A trial has nothing to stop
          (it lapses on its own) and a parked workspace has already stopped - offering
          the control there would mean a button that can only ever return an error. */}
      {purchased && subRow?.razorpaySubscriptionId && subRow.status !== "CANCELED" && subRow.status !== "HALTED" ? (
        <div className="border-t pt-4">
          <CancelPlan
            periodEnd={subRow.currentPeriodEnd?.toISOString() ?? null}
            alreadyCancelling={subRow.cancelAtPeriodEnd}
          />
        </div>
      ) : null}
    </div>
  );
}

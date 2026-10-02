import { requireWorkspace } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, PLAN_PRICE_USD, TRIAL_PLAN, type PlanId } from "@/lib/billing/plans";
import { BillingPlans } from "@/features/billing/components/billing-plans";

export const dynamic = "force-dynamic";

const RANK: Record<PlanId, number> = { GATE: 0, SIGNAL: 1, AGENCY: 2, ENTERPRISE: 3 };

/** A short, human feature list per tier for the billing cards. */
function featuresFor(plan: PlanId): string[] {
  const l = PLAN_LIMITS[plan];
  const assessments = l.maxAssessments === null ? "Unlimited assessments" : `${l.maxAssessments} assessment${l.maxAssessments === 1 ? "" : "s"}`;
  const responses = l.responsesPerMonth === null ? "Unlimited responses" : `${l.responsesPerMonth.toLocaleString()} responses / mo`;
  const out = [assessments, responses];
  out.push("Disqualified visitors free, unmetered");
  if (plan === "GATE") out.push("Qualification gate, CAPI, routing · badge shown");
  if (plan === "SIGNAL") out.push("Custom domain, AI reports, heatmap · badge removed");
  if (plan === "AGENCY") out.push("Everything in Signal + sub-accounts, API");
  if (plan === "ENTERPRISE") out.push("Custom caps, SSO, SLA");
  return out;
}

export default async function BillingPage() {
  const { tenantId } = await requireWorkspace();
  const [user, resolved] = await Promise.all([getCurrentUser(), resolvePlan(tenantId)]);

  // An INTERNAL workspace is not rated against the catalog, so there is no plan to show
  // and nothing to sell. `resolved.plan` is null here, and the old `?? "FREE"` turned
  // that into "You're on the Free plan" with live Upgrade buttons — the exact opposite
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
            {resolved.status ? ` (${resolved.status.toLowerCase()})` : ""}. Upgrade any time — it takes effect right after payment.
          </p>
        ) : resolved.trialing ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            You&apos;re on the{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {resolved.trialDaysLeft}-day
            </span>{" "}
            remainder of your free trial, with every{" "}
            <span className="font-semibold text-[var(--foreground)]">{PLAN_LABEL[TRIAL_PLAN]}</span> feature switched
            on. Pick a plan whenever you like — nothing is charged until you do.
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">
            This workspace has{" "}
            <span className="font-semibold text-[var(--foreground)]">no active plan</span> — the funnel is paused and
            your data is kept. Choosing a plan restarts it immediately.
          </p>
        )}
      </div>

      <BillingPlans
        plans={plans}
        currentPlan={currentPlan}
        currentRank={RANK[currentPlan]}
        prefill={{ name: user?.name ?? "", email: user?.email ?? "" }}
      />
    </div>
  );
}

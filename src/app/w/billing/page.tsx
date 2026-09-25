import { requireWorkspace } from "@/lib/auth/guards";
import { getCurrentUser } from "@/lib/auth/session";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, PLAN_LABEL, PLAN_LIMITS, PLAN_PRICE_USD, type PlanId } from "@/lib/billing/plans";
import { BillingPlans } from "@/features/billing/components/billing-plans";

export const dynamic = "force-dynamic";

const RANK: Record<PlanId, number> = { FREE: 0, STARTER: 1, GROWTH: 2, SCALE: 3 };

/** A short, human feature list per tier for the billing cards. */
function featuresFor(plan: PlanId): string[] {
  const l = PLAN_LIMITS[plan];
  const assessments = l.maxAssessments === null ? "Unlimited assessments" : `${l.maxAssessments} assessment${l.maxAssessments === 1 ? "" : "s"}`;
  const responses = l.responsesPerMonth === null ? "Unlimited responses" : `${l.responsesPerMonth.toLocaleString()} responses / mo`;
  const out = [assessments, responses];
  if (plan === "STARTER") out.push("All everyday features");
  if (plan === "GROWTH") out.push("Qualify gate, routing, CAPI, heatmap");
  if (plan === "SCALE") out.push("Everything in Growth + API access");
  if (plan === "FREE") out.push("Assess360 badge");
  return out;
}

export default async function BillingPage() {
  const { tenantId } = await requireWorkspace();
  const [user, resolved] = await Promise.all([getCurrentUser(), resolvePlan(tenantId)]);
  const currentPlan: PlanId = resolved.plan ?? "FREE";

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
        <p className="text-sm text-[var(--muted-foreground)]">
          You&apos;re on the <span className="font-semibold text-[var(--foreground)]">{PLAN_LABEL[currentPlan]}</span> plan
          {resolved.status ? ` (${resolved.status.toLowerCase()})` : ""}. Upgrade any time — it takes effect right after payment.
        </p>
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

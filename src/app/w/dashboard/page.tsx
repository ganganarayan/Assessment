import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { getDashboardCounts } from "@/features/assessment/data";
import { tenantOnly } from "@/lib/tenant/scope";
import { resolvePlan } from "@/lib/billing/entitlements";
import { resolveOnboardingVideoUrl, resolveOnboardingSteps } from "@/lib/settings/config";
import { OnboardingSteps } from "@/features/platform/components/onboarding-steps";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * The workspace's own Dashboard - the mirror of /admin for a tenant.
 *
 * It exists because a new workspace landed on an empty Assessments list, which says
 * "No assessments yet" and nothing about what to do with the product they have just
 * started paying attention to. A first screen that is empty by definition on day one is
 * the worst place to put someone who is deciding whether this works.
 *
 * So the getting-started panel lives here, above the counts, for the length of the
 * trial. After that this is a normal dashboard and the panel is gone.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const { tenantId } = await requireWorkspace();
  const [counts, resolved, onboardingVideoUrl, onboardingSteps] = await Promise.all([
    getDashboardCounts(tenantOnly(tenantId)),
    resolvePlan(tenantId),
    resolveOnboardingVideoUrl(),
    resolveOnboardingSteps(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Link href="/w/assessments/new" className={buttonVariants()}>
          New assessment
        </Link>
      </div>

      {resolved.trialing ? (
        <OnboardingSteps videoUrl={onboardingVideoUrl} steps={onboardingSteps} />
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assessments" value={counts.assessments} />
        <Stat label="Published" value={counts.published} />
        <Stat label="Completed submissions" value={counts.submissions} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/w/assessments" className={buttonVariants({ variant: "outline" })}>
          Manage assessments
        </Link>
        <Link href="/w/submissions" className={buttonVariants({ variant: "outline" })}>
          View submissions
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardHeader>
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
    </Card>
  );
}

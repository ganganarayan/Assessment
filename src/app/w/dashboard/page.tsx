import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { getDashboardCounts } from "@/features/assessment/data";
import { tenantOnly } from "@/lib/tenant/scope";
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
 * So the getting-started panel lives here, above the counts.
 *
 * It is NOT gated on the trial. It used to be, and that was wrong: `trialing` is false
 * for an internal/unlimited workspace, for one on a manual grant, for a paying customer
 * and for a parked one - so the steps the owner wrote were invisible to nearly everyone
 * including the owner testing their own tenant, and looked like a bug in the editor.
 *
 * Whether the panel shows is the OWNER'S switch, not a side effect of billing state:
 * steps authored means shown, all rows cleared means gone, which is exactly what the
 * editor in Settings tells them.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceDashboardPage() {
  const { tenantId } = await requireWorkspace();
  const [counts, onboardingVideoUrl, onboardingSteps] = await Promise.all([
    getDashboardCounts(tenantOnly(tenantId)),
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

      <OnboardingSteps videoUrl={onboardingVideoUrl} steps={onboardingSteps} />

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

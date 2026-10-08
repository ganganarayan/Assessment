import Link from "next/link";
import { getDashboardCounts } from "@/features/assessment/data";
import { actingDataScope, actingConfigTenantId } from "@/lib/tenant/acting";
import { currentUserCanEdit } from "@/lib/auth/guards";
import { listTemplatesForOwner } from "@/features/templates/data";
import { TemplateLibrary } from "@/features/templates/components/template-library";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * The platform owner's dashboard.
 *
 * It carries the SAME template panel a tenant sees on theirs, for two reasons. The
 * obvious one is that the owner builds funnels too and should start from a template
 * like anybody else. The one that matters more: this is the screen he lands on, so it
 * is where the review queue belongs - every template that is not published yet, marked
 * as invisible, with an Import button to actually run one.
 *
 * The owner's copy differs from a tenant's in exactly two ways, and both follow from
 * that: it lists UNPUBLISHED templates (a tenant's shelf has none by definition), and
 * every row is importable, so a template can be walked before it is approved rather
 * than judged from its questions on a page.
 */
export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const [counts, ownerTenantId, canEdit] = await Promise.all([
    getDashboardCounts(await actingDataScope()),
    actingConfigTenantId(),
    currentUserCanEdit(),
  ]);
  const templates = await listTemplatesForOwner(ownerTenantId);
  const unpublished = templates.filter((t) => !t.published && t.reviewStatus !== "REJECTED").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <Link href="/admin/assessments/new" className={buttonVariants()}>
          New assessment
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Stat label="Assessments" value={counts.assessments} />
        <Stat label="Published" value={counts.published} />
        <Stat label="Completed submissions" value={counts.submissions} />
      </div>

      <div className="flex flex-wrap gap-3">
        <Link href="/admin/assessments" className={buttonVariants({ variant: "outline" })}>
          Manage assessments
        </Link>
        <Link href="/admin/submissions" className={buttonVariants({ variant: "outline" })}>
          View submissions
        </Link>
      </div>

      <TemplateLibrary
        items={templates}
        canEdit={canEdit}
        collapsible
        defaultOpen
        showPublishState
        manageHref="/admin/templates"
        heading="Templates"
        blurb={
          unpublished > 0
            ? `${unpublished} of these ${templates.length} are not published, so no tenant can see them. Import one to walk it before you decide, then publish it from Manage.`
            : "The same library your tenants see. Import one to start from it, or publish and order them from Manage."
        }
      />
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

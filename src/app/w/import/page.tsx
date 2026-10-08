import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { tenantCan } from "@/lib/billing/entitlements";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";
import { TextImport } from "@/features/assessment/components/admin/text-import";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkspaceImportPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");

  // Billing gate - importing creates assessments, so warn up front at the cap rather
  // than after the upload. Super admins (impersonating) are never limited.
  const cap = impersonating ? ({ ok: true } as const) : await assertCanCreateAssessment(tenantId);
  // A super admin operating a workspace is never gated.
  const canBulkImport = impersonating || (await tenantCan(tenantId, "bulkImport"));
  if (!cap.ok) {
    return (
      <div className="flex flex-col gap-6">
        <div>
          <Link href="/w/assessments" className="text-sm underline">
            ← Assessments
          </Link>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">Import assessment</h1>
        </div>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-4 text-sm">
          <p className="text-[var(--foreground)]">
            You&apos;ve reached your plan&apos;s limit of{" "}
            <span className="font-semibold">
              {cap.limit} assessment{cap.limit === 1 ? "" : "s"}
            </span>
            . Upgrade your plan to import more.
          </p>
          <Link href="/w/billing" className={buttonVariants({ size: "sm" })}>
            Upgrade plan
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/w/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import assessment</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Plain text / Markdown you write yourself, or a JSON or CSV file taken out of another tool. Both are validated and previewed
          before anything is written - into this workspace.
        </p>
      </div>

      <TextImport basePath="/w/assessments" />

      {/* Bulk import is an AGENCY capability: lifting a finished assessment out of
          another workspace is how an agency moves work between clients, where writing
          one from plain text is the product itself and stays on every tier. Export is
          never gated - a customer's own data must always come out. */}
      <div className="border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">From a JSON or CSV file</h2>
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Moving to Assess360 from another tool? Take the file out of that tool and load it here.
        </p>
        {canBulkImport ? (
          <ImportWizard doneHref="/w/assessments" />
        ) : (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-[var(--border)] bg-[var(--muted)] px-4 py-4 text-sm">
            <p>
              Importing a whole assessment from a JSON or CSV export is part of{" "}
              <strong>Agency</strong>. Writing one from plain text, above, is on every plan, and
              exporting your own data always is.
            </p>
            <Link href="/w/billing" className={buttonVariants({ size: "sm" })}>
              See plans
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

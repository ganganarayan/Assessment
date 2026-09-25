import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";
import { TextImport } from "@/features/assessment/components/admin/text-import";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkspaceImportPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");

  // Billing gate — importing creates assessments, so warn up front at the cap rather
  // than after the upload. Super admins (impersonating) are never limited.
  const cap = impersonating ? ({ ok: true } as const) : await assertCanCreateAssessment(tenantId);
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
          Plain text / Markdown you write yourself, or a JSON/CSV export. Both are validated and previewed
          before anything is written — into this workspace.
        </p>
      </div>

      <TextImport basePath="/w/assessments" />

      <div className="border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">From a JSON / CSV export</h2>
        <ImportWizard doneHref="/w/assessments" />
      </div>
    </div>
  );
}

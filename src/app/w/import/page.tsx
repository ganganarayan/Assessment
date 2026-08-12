import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";
import { previewTenantImport, importTenantAssessments } from "@/features/assessment/actions/transfer";

export const dynamic = "force-dynamic";

export default async function WorkspaceImportPage() {
  await requireWorkspace();
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/w/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import assessment</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Upload a JSON export (authoritative) or a CSV. Imported assessments are added to
          your workspace as drafts. The file is validated and previewed before anything is written.
        </p>
      </div>
      <ImportWizard
        previewAction={previewTenantImport}
        importAction={importTenantAssessments}
        doneHref="/w/assessments"
      />
    </div>
  );
}

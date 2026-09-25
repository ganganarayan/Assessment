import Link from "next/link";
import { redirect } from "next/navigation";
import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";
import { TextImport } from "@/features/assessment/components/admin/text-import";

export const dynamic = "force-dynamic";

export default async function WorkspaceImportPage() {
  await requireWorkspace();
  if (!(await currentUserCanEdit())) redirect("/w/assessments");
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

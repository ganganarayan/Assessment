import Link from "next/link";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";
import { TextImport } from "@/features/assessment/components/admin/text-import";

export default function ImportAssessmentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import assessment</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Two ways in: a JSON or CSV file taken out of another tool, or plain text / Markdown you write
          yourself. Both are validated and previewed before anything is written.
        </p>
      </div>

      <TextImport />

      <div className="border-t pt-6">
        <h2 className="mb-3 text-lg font-semibold">From a JSON or CSV file</h2>
        <p className="mb-3 text-xs text-[var(--muted-foreground)]">
          Moving to Assess360 from another tool? Take the file out of that tool and load it here.
        </p>
        <ImportWizard />
      </div>
    </div>
  );
}

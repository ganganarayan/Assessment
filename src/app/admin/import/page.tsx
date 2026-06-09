import Link from "next/link";
import { ImportWizard } from "@/features/assessment/components/admin/import-wizard";

export default function ImportAssessmentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">Import assessment</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Upload a JSON export (authoritative) or a CSV. The structure is
          validated and previewed before anything is written.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}

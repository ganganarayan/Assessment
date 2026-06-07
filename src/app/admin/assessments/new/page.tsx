import Link from "next/link";
import { AssessmentForm } from "@/features/assessment/components/admin/assessment-form";

export default function NewAssessmentPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/assessments" className="text-sm underline">
          ← Assessments
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">New assessment</h1>
      </div>
      <AssessmentForm mode="create" />
    </div>
  );
}

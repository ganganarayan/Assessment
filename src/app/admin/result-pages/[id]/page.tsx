import { requireSuperAdmin } from "@/lib/auth/guards";
import { DocEditor } from "@/features/result-pages/components/doc-editor";

/** One result page, on the owner's surface. */
export const dynamic = "force-dynamic";

export default async function AdminResultPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireSuperAdmin();
  const { id } = await params;
  return <DocEditor docId={id} basePath="/admin/result-pages" assessmentBase="/admin/assessments" />;
}

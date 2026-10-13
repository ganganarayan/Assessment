import { requireWorkspace } from "@/lib/auth/guards";
import { DocEditor } from "@/features/result-pages/components/doc-editor";

/** One result page, on the workspace surface. */
export const dynamic = "force-dynamic";

export default async function WorkspaceResultPageEditor({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace();
  const { id } = await params;
  return <DocEditor docId={id} basePath="/w/result-pages" assessmentBase="/w/assessments" />;
}

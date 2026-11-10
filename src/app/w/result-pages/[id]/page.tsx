import { requireWorkspace, canEdit } from "@/lib/auth/guards";
import { ViewOnly } from "@/components/view-only";
import { DocEditor } from "@/features/result-pages/components/doc-editor";

/** One result page, on the workspace surface. */
export const dynamic = "force-dynamic";

export default async function WorkspaceResultPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { user: viewer } = await requireWorkspace();
  const readOnly = !canEdit(viewer);
  const { id } = await params;
  return (
    <ViewOnly readOnly={readOnly}>
      <DocEditor docId={id} basePath="/w/result-pages" assessmentBase="/w/assessments" />
    </ViewOnly>
  );
}

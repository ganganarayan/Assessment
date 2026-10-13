import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { listDocs } from "@/features/result-pages/data";
import { DocLibrary } from "@/features/result-pages/components/doc-library";

/**
 * The workspace's result-page library - the same screen the owner gets, scoped to this
 * tenant. Every super-admin surface belongs on /w too unless it is platform-only, and
 * a page library is the opposite of platform-only: it is the thing that makes the
 * second funnel quick to build.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceResultPagesPage() {
  await requireWorkspace();
  const [rows, canEdit] = await Promise.all([listDocs(), currentUserCanEdit()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Result pages</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Your result pages and VSL pages, built once and reused by cloning. A page belongs to at most one funnel, so
          editing one can never change what another funnel is showing. Nothing goes live until you publish it on a
          funnel it is bound to.
        </p>
      </div>
      <DocLibrary rows={rows} basePath="/w/result-pages" canEdit={canEdit} />
    </div>
  );
}

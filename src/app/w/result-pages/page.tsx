import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { listDocs, listShelfDocs } from "@/features/result-pages/data";
import { DocLibrary } from "@/features/result-pages/components/doc-library";
import { DocShelf } from "@/features/result-pages/components/doc-shelf";

/**
 * The workspace's result-page library, with the platform shelf above it.
 *
 * Every super-admin surface belongs on /w too unless it is platform-only, and a page
 * library is the opposite of platform-only: it is what makes the second funnel quick to
 * build. The shelf is read-only here - importing makes a copy that belongs to this
 * workspace, because the 1:1 binding must never cross one.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceResultPagesPage() {
  await requireWorkspace();
  const [rows, shelf, canEdit] = await Promise.all([listDocs(), listShelfDocs(), currentUserCanEdit()]);

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
      <DocShelf rows={shelf} basePath="/w/result-pages" canEdit={canEdit} />
      <DocLibrary rows={rows} basePath="/w/result-pages" canEdit={canEdit} />
    </div>
  );
}

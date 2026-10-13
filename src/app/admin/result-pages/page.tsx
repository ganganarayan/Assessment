import { requireSuperAdmin, currentUserCanEdit } from "@/lib/auth/guards";
import { listDocs } from "@/features/result-pages/data";
import { DocLibrary } from "@/features/result-pages/components/doc-library";

/**
 * The owner's result-page library.
 *
 * Scoped like every other /admin screen: the acting workspace, or the Platform tenant
 * when no workspace has been entered. A page built here is the platform's own, and the
 * way to work on a tenant's pages is to enter that workspace - the same rule the
 * assessment console follows.
 */
export const dynamic = "force-dynamic";

export default async function AdminResultPagesPage() {
  await requireSuperAdmin();
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
      <DocLibrary rows={rows} basePath="/admin/result-pages" canEdit={canEdit} />
    </div>
  );
}

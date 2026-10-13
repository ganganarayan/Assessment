import { requireSuperAdmin, currentUserCanEdit } from "@/lib/auth/guards";
import { resolveActingScope } from "@/lib/tenant/acting";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { listDocs } from "@/features/result-pages/data";
import { DocLibrary } from "@/features/result-pages/components/doc-library";

/**
 * The owner's result-page library, and the platform shelf it feeds.
 *
 * Scoped like every other /admin screen: the acting workspace, or the Platform tenant
 * when no workspace has been entered. A page built here is the platform's own, and the
 * way to work on a tenant's pages is to enter that workspace - the same rule the
 * assessment console follows.
 *
 * The shelf controls appear only while the owner is in the PLATFORM's own library, not
 * while they are inside a customer's workspace: a tenant's page is theirs, and
 * publishing it would hand their headline and their video to the whole install.
 */
export const dynamic = "force-dynamic";

export default async function AdminResultPagesPage() {
  await requireSuperAdmin();
  const scope = await resolveActingScope();
  const [rows, canEdit] = await Promise.all([listDocs(), currentUserCanEdit()]);
  const inPlatformLibrary = scope.tenantId === null || scope.tenantId === PLATFORM_TENANT_ID;
  const onShelf = rows.filter((r) => r.shelfListed).length;

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

      {/* The rule stated where the decision is made, the way the Template console does
          it: a page is invisible to every workspace until it is published to the shelf,
          which is what lets this deploy before anybody has read the content. */}
      {inPlatformLibrary ? (
        <p className="rounded-lg border border-green-600/40 bg-green-600/5 p-3 text-sm">
          <strong>
            {onShelf === 0
              ? "Nothing is on the shelf yet."
              : `${onShelf} page${onShelf === 1 ? " is" : "s are"} on the shelf.`}
          </strong>{" "}
          A page on the shelf can be imported by every workspace, as their own copy. Clone a funnel&apos;s page first, so
          the shelf never hands out a page that is serving live traffic, then publish the copy.
        </p>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">
          You are in a customer workspace, so these are their pages. Leave the workspace to manage the platform shelf.
        </p>
      )}

      <DocLibrary rows={rows} basePath="/admin/result-pages" canEdit={canEdit} canManageShelf={inPlatformLibrary} />
    </div>
  );
}

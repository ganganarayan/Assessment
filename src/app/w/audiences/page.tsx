import { getAudienceLists, getAudienceUsage } from "@/features/admin/actions/audience-list";
import { AudienceManager } from "@/features/admin/components/audience-manager";
import { requireWorkspace, canEdit } from "@/lib/auth/guards";
import { ViewOnlyNote } from "@/components/view-only";

export const dynamic = "force-dynamic";

/**
 * Workspace Audiences - the same named lists and normalize tools as /admin/audiences,
 * scoped to this workspace. The actions resolve through the acting scope, so a tenant
 * admin edits their own lists. Not plan-gated: cleaning up what respondents typed is
 * part of owning your data.
 */
export default async function WorkspaceAudiencesPage() {
  const { user: viewer } = await requireWorkspace();
  const readOnly = !canEdit(viewer);
  const [lists, usage] = await Promise.all([getAudienceLists(), getAudienceUsage()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Audiences</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Keep as many named lists of roles as you need, edit any of them at any time, and clean up
          the values respondents typed in the free-text audience field. Each assessment picks the
          list it uses.
        </p>
      </div>

      {readOnly ? <ViewOnlyNote /> : null}
      <AudienceManager lists={lists} rows={usage.rows} canonical={usage.canonical} />
    </div>
  );
}

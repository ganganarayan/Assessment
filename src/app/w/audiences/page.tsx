import { getAudienceCanonical, getAudienceUsage } from "@/features/admin/actions/audience-list";
import { AudienceManager } from "@/features/admin/components/audience-manager";
import { requireWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Workspace Audiences - the same canonical list and normalize tools as
 * /admin/audiences, scoped to this workspace. The actions resolve through the
 * acting scope, so a tenant admin edits their own list. Not plan-gated: cleaning up
 * what respondents typed is part of owning your data.
 */
export default async function WorkspaceAudiencesPage() {
  await requireWorkspace();
  const [canonical, usage] = await Promise.all([getAudienceCanonical(), getAudienceUsage()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Audiences</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Maintain your default list of roles and clean up the values respondents typed in the
          free-text audience field.
        </p>
      </div>

      <AudienceManager
        initialCanonical={canonical.join("\n")}
        rows={usage.rows}
        canonical={usage.canonical}
      />
    </div>
  );
}

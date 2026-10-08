import { requireWorkspace, currentUserCanEdit } from "@/lib/auth/guards";
import { assertCanCreateAssessment } from "@/lib/billing/gate";
import { listTemplatesForTenant } from "@/features/templates/data";
import { TemplateLibrary } from "@/features/templates/components/template-library";

/**
 * The workspace's Templates page.
 *
 * The same list appears at the top of the dashboard; this page exists for the second
 * visit, when they know what they are looking for and do not want to scroll past their
 * own numbers to reach it.
 *
 * The plan cap is resolved HERE rather than at the click. At the cap, Import would
 * fail with an error after the person had already chosen - so the reason is stated
 * above the list and every button is disabled, which is the same information delivered
 * before the decision instead of after it.
 */
export const dynamic = "force-dynamic";

export default async function WorkspaceTemplatesPage() {
  const { tenantId, impersonating } = await requireWorkspace();
  const [items, canEdit, cap] = await Promise.all([
    listTemplatesForTenant(tenantId),
    currentUserCanEdit(),
    impersonating ? Promise.resolve({ ok: true } as const) : assertCanCreateAssessment(tenantId),
  ]);

  const capReason = cap.ok
    ? null
    : `You're at your plan's limit of ${cap.limit} assessment${cap.limit === 1 ? "" : "s"}, so importing is paused. Upgrade or delete one to import a template.`;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Working funnels you can import and edit. Nothing you import is live until you publish it.
        </p>
      </div>

      {items.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">
          No templates are available yet. When there are, they will appear here and on your dashboard.
        </p>
      ) : (
        <TemplateLibrary
          items={items}
          canEdit={canEdit}
          capReason={capReason}
          heading="Start from a template"
        />
      )}
    </div>
  );
}

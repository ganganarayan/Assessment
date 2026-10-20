
import { requireWorkspace } from "@/lib/auth/guards";
import { requireReleasedFeature } from "@/lib/features/route-guard";
import { listContacts } from "@/features/contacts/data";
import { ContactsScreen } from "@/features/contacts/components/contacts-screen";

export const dynamic = "force-dynamic";

/**
 * Contacts, workspace view. Scoped to this workspace by requireWorkspace, which is
 * also what resolves a super admin who has entered it.
 */
export default async function WorkspaceContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Held back until the owner releases it: a hidden link is presentation, not a permission.
  await requireReleasedFeature("contacts");
  const { tenantId } = await requireWorkspace();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");

  const filters = { q: one("q"), tagId: one("tag"), assessmentId: one("assessment"), dnd: one("dnd") };
  const view = await listContacts(tenantId, {
    q: filters.q || undefined,
    tagId: filters.tagId || undefined,
    assessmentId: filters.assessmentId || undefined,
    dnd: filters.dnd === "in" || filters.dnd === "out" ? filters.dnd : undefined,
    page: Number(one("page")) || 1,
  });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One row per person, however many times they have been through a funnel. Tags and the
          unsubscribe state here are what a workflow or a broadcast reads.
        </p>
      </div>
      <ContactsScreen view={view} filters={filters} basePath="/w/contacts" />
    </div>
  );
}

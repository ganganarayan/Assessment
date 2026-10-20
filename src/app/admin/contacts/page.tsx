import { actingTenantId } from "@/lib/tenant/acting";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listContacts } from "@/features/contacts/data";
import { ContactsScreen } from "@/features/contacts/components/contacts-screen";

export const dynamic = "force-dynamic";

/**
 * Contacts, platform view. Follows the ACTING scope like every other shared screen:
 * the platform sees its own, and a super admin who has entered a workspace sees that
 * workspace.
 */
export default async function AdminContactsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const tenantId = await actingTenantId();

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
      <ContactsScreen view={view} filters={filters} basePath="/admin/contacts" />
    </div>
  );
}

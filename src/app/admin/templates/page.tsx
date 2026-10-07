import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { listAllTemplates } from "@/features/templates/data";
import { TemplatesConsole } from "@/features/templates/components/templates-console";

/**
 * The platform owner's Template Library screen.
 *
 * Owner-only for every mutation, not merely super-admin: publishing a template puts
 * content on the first screen of every workspace on the install, which is closer to
 * shipping than to editing a record. Staff can read it; the actions check again on the
 * server, because a hidden button is not a permission.
 */
export const dynamic = "force-dynamic";

export default async function AdminTemplatesPage() {
  const user = await requireSuperAdmin();
  const items = await listAllTemplates();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Templates</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The starting points every workspace sees. Built-ins are seeded from the repo, so their content is
          changed in git and re-seeded here; publishing and ordering are decided on this screen and survive
          every deploy.
        </p>
      </div>
      <TemplatesConsole items={items} canEdit={!isStaff(user)} />
    </div>
  );
}

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
  const unpublished = items.filter((i) => !i.published && i.reviewStatus !== "REJECTED").length;

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
      {/* The rule stated where the decision is made. A seeded template is invisible to
          every tenant until it is published here, which is what lets the feature deploy
          to production before anyone has read the content - and it is worth saying out
          loud, because "it is live but nobody can see it" is not an assumption anyone
          should have to make about their own install. */}
      {unpublished > 0 ? (
        <p className="rounded-lg border border-green-600/40 bg-green-600/5 p-3 text-sm">
          <strong>
            {unpublished} template{unpublished === 1 ? " is" : "s are"} unpublished and visible to nobody.
          </strong>{" "}
          Seeding a template never publishes it. Download one to read its questions, then tick Published when
          you are happy with it - that tick is the only thing that puts it in front of a tenant.
        </p>
      ) : null}

      <TemplatesConsole items={items} canEdit={!isStaff(user)} />
    </div>
  );
}

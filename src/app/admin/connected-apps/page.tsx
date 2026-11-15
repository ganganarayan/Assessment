import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ConnectedAppForm } from "@/features/connected-apps/components/connected-app-form";
import type { ConnectedAppRow } from "@/features/connected-apps/schema";

export const dynamic = "force-dynamic";

/**
 * Super admin, Connected apps: the other apps whose tools Claude sees through the Assess360
 * connection, for users who are active in them. Lives here, not in env, so adding an app is a
 * form, not a redeploy.
 */
export default async function ConnectedAppsPage() {
  await requireSuperAdmin();
  const rows = await prisma.mcpUpstreamApp.findMany({ orderBy: [{ sortOrder: "asc" }, { prefix: "asc" }] });
  const apps: ConnectedAppRow[] = rows.map((r) => ({
    id: r.id,
    prefix: r.prefix,
    name: r.name,
    url: r.url ?? "",
    hasSecret: !!r.secretEnc,
    description: r.description,
    upgradeUrl: r.upgradeUrl ?? "",
    enabled: r.enabled,
    sortOrder: r.sortOrder,
  }));

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6">
      <div>
        <h1 className="text-xl font-semibold">Connected apps</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Claude reaches these apps through the same Assess360 connection. A user sees an app&apos;s tools only when that app says
          their email is active there. An app with no URL stays hidden. Claude is shown at most 34 tools in all, shared between the
          apps in turns.
        </p>
      </div>
      {apps.map((a) => (
        <ConnectedAppForm key={a.id} row={a} />
      ))}
      <ConnectedAppForm />
    </div>
  );
}

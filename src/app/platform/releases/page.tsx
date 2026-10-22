import { requireSuperAdmin } from "@/lib/auth/guards";
import { FeatureReleasesCard } from "@/features/platform/components/feature-releases-card";
import { listFeatureReleases } from "@/features/platform/feature-releases";

export const dynamic = "force-dynamic";

/**
 * Feature releases, on a page of their own.
 *
 * 🔴 They were a card at the bottom of the Tenants page. On an empty account that is
 * fine; on a real one the tenant list is long enough that the switches are below the
 * fold, and a control you have to scroll to find reads as a control that was never
 * built. Releasing a feature to every workspace at once is not a footnote to the
 * tenant list, so it does not live underneath it.
 *
 * Super admin only, twice over: the rail shows the link only to the owner, and
 * listFeatureReleases and setFeatureRelease each call requireSuperAdmin themselves. A
 * page guard alone would leave the actions reachable.
 */
export default async function PlatformReleasesPage() {
  await requireSuperAdmin();
  const fr = await listFeatureReleases();

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Feature releases</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          One switch per feature, for every workspace at once. Held back means finished but
          nobody has it yet. Your own internal workspaces are exempt, so you can use a feature
          here while customers still cannot see it.
        </p>
      </div>
      {fr.ok && fr.data ? (
        <FeatureReleasesCard initial={fr.data} />
      ) : (
        <div className="rounded-md border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">The switches could not be loaded just now.</p>
          <p className="mt-1 text-[var(--muted-foreground)]">{fr.ok ? "No data came back." : fr.error}</p>
        </div>
      )}
    </main>
  );
}

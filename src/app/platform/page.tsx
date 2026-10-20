import Link from "next/link";
import { AppBrand } from "@/components/app-brand";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  listTenants,
  listDeletedTenants,
  listUsers,
  listDeletedUsers,
} from "@/features/platform/actions";
import { PlatformConsole } from "@/features/platform/components/platform-console";
import { LandingVideosCard } from "@/features/platform/components/landing-videos-card";
import { getLandingVideosRaw } from "@/features/platform/landing-videos";
import { CtaOfferCard } from "@/features/platform/components/cta-offer-card";
import { getCtaOfferRaw } from "@/features/platform/cta-offer";
import { StorageSettingsCard } from "@/features/platform/components/storage-settings-card";
import { FeatureReleasesCard } from "@/features/platform/components/feature-releases-card";
import { listFeatureReleases } from "@/features/platform/feature-releases";
import { getStorageSettings } from "@/features/platform/storage-settings";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const dynamic = "force-dynamic";

export default async function PlatformPage() {
  const me = await requireSuperAdmin();
  const [t, dt, u, d, lv, st, cta, fr] = await Promise.all([
    listTenants(),
    listDeletedTenants(),
    listUsers(),
    listDeletedUsers(),
    getLandingVideosRaw(),
    getStorageSettings(),
    getCtaOfferRaw(),
    listFeatureReleases(),
  ]);
  // Any loader that failed (a transient DB error) surfaces as a banner - the page
  // still renders with whatever loaded, instead of a full-page server crash.
  const loadErrors = [t, dt, u, d, lv, st, cta, fr]
    .filter((r): r is { ok: false; error: string } => !r.ok)
    .map((r) => r.error);
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <AppBrand href="/platform" subtitle="Platform console" />
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Platform console</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Super admin · create tenants and assign logins. Assessment work happens inside each
            tenant&apos;s own workspace (coming in the next stage).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* Controls, not footnotes: these were small underlined links in a row of
              text, which is why the stats page read as not existing. */}
          <Link
            href="/platform/stats"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-[var(--muted)]"
          >
            Marketing stats
          </Link>
          <Link
            href="/admin"
            className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-[var(--muted)]"
          >
            Assessment admin
          </Link>
          <SignOutButton />
        </div>
      </div>
      {loadErrors.length > 0 ? (
        <div className="rounded-md border border-amber-500 bg-amber-500/10 px-4 py-3 text-sm">
          <p className="font-medium">Some data couldn&apos;t be loaded just now.</p>
          <ul className="mt-1 list-disc pl-5 text-[var(--muted-foreground)]">
            {loadErrors.map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <PlatformConsole
        initialTenants={t.ok && t.data ? t.data : []}
        initialDeletedTenants={dt.ok && dt.data ? dt.data : []}
        initialUsers={u.ok && u.data ? u.data : []}
        initialDeletedUsers={d.ok && d.data ? d.data : []}
        currentUserId={me.id}
      />
      {fr.ok && fr.data ? <FeatureReleasesCard initial={fr.data} /> : null}
      {/* The offer first, then the videos: what the buttons say and where they go is
          the landing page's whole job, and the videos dress it. */}
      {cta.ok && cta.data ? (
        <CtaOfferCard
          initialHref={cta.data.href}
          initialTrialLabel={cta.data.trialLabel}
          initialDfyLabel={cta.data.dfyLabel}
        />
      ) : null}
      <LandingVideosCard
        initialHero={lv.ok && lv.data ? lv.data.hero : ""}
        initialTiles={lv.ok && lv.data ? lv.data.tiles : {}}
      />
      {st.ok && st.data ? <StorageSettingsCard initial={st.data} /> : null}
    </main>
  );
}

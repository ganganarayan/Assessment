import type { Metadata } from "next";
import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getTenantContext, getCurrentTenant } from "@/lib/tenant/context";
import { rootAssessmentSlugFor } from "@/features/assessment/root-assessment";
import { buttonVariants } from "@/components/ui/button";
import { Landing } from "@/components/marketing/Landing";
import { PlatformPixel } from "@/components/platform-pixel";
import { LandingTracker } from "@/features/billing/components/landing-tracker";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { getLandingVideos } from "@/features/platform/landing-videos";
import { MARKETING } from "@/lib/marketing/content";

// Marketing metadata is applied only on the platform root domain. Tenant
// (subdomain / custom-domain) roots keep the app's default metadata.
export async function generateMetadata(): Promise<Metadata> {
  const { source } = await getTenantContext();
  if (source !== "root") return {};

  return {
    title: MARKETING.title,
    description: MARKETING.description,
    alternates: { canonical: MARKETING.domain + "/" },
    openGraph: {
      type: "website",
      siteName: MARKETING.name,
      title: MARKETING.title,
      description: MARKETING.description,
      url: MARKETING.domain + "/",
      images: [MARKETING.domain + MARKETING.ogImage],
    },
    twitter: {
      card: "summary_large_image",
      title: MARKETING.title,
      description: MARKETING.description,
      images: [MARKETING.domain + MARKETING.ogImage],
    },
  };
}

export default async function HomePage() {
  const { slug, source } = await getTenantContext();

  // Platform root (assess360.divineleads.guru) → marketing landing. The SaaS pixel
  // fires PageView here (separate from the Gita assessment pixel).
  if (source === "root") {
    const [{ pixelId }, videos] = await Promise.all([
      resolvePlatformMetaConfig(),
      getLandingVideos(),
    ]);
    return (
      <>
        <PlatformPixel pixelId={pixelId} />
        <LandingTracker />
        <Landing videos={videos} />
      </>
    );
  }

  // Tenant root (subdomain or custom domain). Land on that tenant's funnel, which is
  // what anyone typing the bare domain is looking for — it used to show the generic
  // "foundation ready" page instead, so a customer who pointed their own domain at us
  // got a dead end unless they knew to add /a/<slug> by hand.
  const tenant = await getCurrentTenant();
  if (tenant) {
    const funnelSlug = await rootAssessmentSlugFor(tenant.id, tenant.primaryAssessmentId);
    if (funnelSlug) redirect(`/a/${funnelSlug}`);
    // No published assessment, or several with none chosen: fall through to the generic
    // page rather than guessing which one a visitor should see.
  }

  const session = await getSession();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16 text-center">
      <div className="flex flex-col items-center gap-3">
        <span className="rounded-full border px-3 py-1 text-xs font-medium text-[var(--muted-foreground)]">
          Phase 1 deployed successfully
        </span>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
          Assess360 Foundation Ready
        </h1>
        <p className="max-w-md text-sm text-[var(--muted-foreground)] sm:text-base">
          Multi-tenant foundation is live: authentication, tenant resolution,
          storage, and database schema are configured.
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-3 sm:flex-row sm:justify-center">
        {session ? (
          <Link href="/dashboard" className={buttonVariants()}>
            Go to dashboard
          </Link>
        ) : (
          <>
            <Link href="/sign-in" className={buttonVariants()}>
              Sign In
            </Link>
            <Link
              href="/sign-up"
              className={buttonVariants({ variant: "outline" })}
            >
              Sign Up
            </Link>
          </>
        )}
      </div>

      <div className="rounded-lg border bg-[var(--muted)] px-4 py-3 text-xs text-[var(--muted-foreground)]">
        Tenant context · source:{" "}
        <span className="font-mono text-[var(--foreground)]">{source}</span>
        {slug ? (
          <>
            {" "}· slug:{" "}
            <span className="font-mono text-[var(--foreground)]">{slug}</span>
          </>
        ) : null}
      </div>
    </main>
  );
}

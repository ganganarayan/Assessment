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
import { OG_IMAGE } from "@/lib/seo/site";

// Marketing metadata belongs to the PLATFORM's own host. "Platform" is defined as
// "no tenant owns this host" rather than "this host equals NEXT_PUBLIC_ROOT_DOMAIN":
// the Domain table already says which hosts belong to tenants, so the platform needs
// no configured address of its own and keeps working when that variable is unset.
export async function generateMetadata(): Promise<Metadata> {
  if (await getCurrentTenant()) return {};

  return {
    // `absolute` because the root layout now carries a title template: a plain string
    // here would render "Assess360 - Qualify leads before the sales call · Assess360".
    title: { absolute: MARKETING.title },
    description: MARKETING.description,
    alternates: { canonical: MARKETING.domain + "/" },
    openGraph: {
      type: "website",
      siteName: MARKETING.name,
      title: MARKETING.title,
      description: MARKETING.description,
      url: MARKETING.domain + "/",
      images: [OG_IMAGE],
    },
    twitter: {
      card: "summary_large_image",
      title: MARKETING.title,
      description: MARKETING.description,
      images: [OG_IMAGE.url],
    },
  };
}

export default async function HomePage() {
  const { slug, source } = await getTenantContext();

  // Whose host is this? A tenant's, if the Domain table (or a subdomain, when one is
  // configured) says so - otherwise the platform's. Asking the data instead of
  // comparing against a configured root is what lets the platform move hosts, or run
  // with no root domain at all, without the landing page disappearing.
  const tenant = await getCurrentTenant();

  // Platform → marketing landing. The SaaS pixel fires PageView here (separate from
  // the Gita assessment pixel).
  if (!tenant) {
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
  // what anyone typing the bare domain is looking for - it used to show the generic
  // "foundation ready" page instead, so a customer who pointed their own domain at us
  // got a dead end unless they knew to add /a/<slug> by hand.
  {
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
          // Sign in only. This is a TENANT's host, and a tenant's domain is their
          // shop front rather than a place to sell the product from - the platform
          // owner takes the signups. The button is the visible half; the endpoint
          // refuses it too, which is the half that matters.
          <Link href="/sign-in" className={buttonVariants()}>
            Sign In
          </Link>
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

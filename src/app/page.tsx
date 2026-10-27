import type { Metadata } from "next";
import { getSession } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { rootAssessmentSlugFor } from "@/features/assessment/root-assessment";
import { Landing } from "@/components/marketing/Landing";
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
  // Whose host is this? A tenant's, if the Domain table (or a subdomain, when one is
  // configured) says so - otherwise the platform's. Asking the data instead of
  // comparing against a configured root is what lets the platform move hosts, or run
  // with no root domain at all, without the landing page disappearing.
  const tenant = await getCurrentTenant();

  // Platform → marketing landing.
  //
  // The SaaS pixel and the page-view recorder used to be mounted HERE, which is why
  // only this page was ever counted. They moved into <Nav> (rendered by Landing), so
  // every public surface is instrumented and none of them can ship without it. Mounting
  // them again here would fire two PageViews for one visit.
  if (!tenant) {
    return <Landing videos={await getLandingVideos()} />;
  }

  // Tenant root (subdomain or custom domain). Land on that tenant's funnel, which is
  // what anyone typing the bare domain is looking for - it used to show the generic
  // "foundation ready" page instead, so a customer who pointed their own domain at us
  // got a dead end unless they knew to add /a/<slug> by hand.
  {
    const funnelSlug = await rootAssessmentSlugFor(tenant.id, tenant.primaryAssessmentId);
    if (funnelSlug) redirect(`/a/${funnelSlug}`);
    // No published assessment, or several with none chosen. There is nothing
    // tenant-relevant to render at the bare domain, so route by session instead of
    // showing a generic "foundation ready" placeholder: signed in → the app
    // (/dashboard forwards to /w), signed out → the staff sign-in door.
  }

  const session = await getSession();
  redirect(session ? "/dashboard" : "/sign-in");
}

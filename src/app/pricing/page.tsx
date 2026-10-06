import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { Pricing } from "@/components/marketing/Pricing";
import { FinalCta } from "@/components/marketing/FinalCta";
import { MARKETING, TIERS, TRIAL_NOTE } from "@/lib/marketing/content";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * A standalone /pricing page, in ADDITION to the "#pricing" section on the landing page -
 * which stays exactly as it is, anchor and all.
 *
 * Why both: directories (G2, Capterra, SourceForge) ask for a "Pricing URL" field and
 * expect a page whose whole subject is pricing, and "<brand> pricing" is a search of its
 * own that an on-page anchor cannot rank for. The table itself is the same <Pricing />
 * component, so there is one source of truth for the numbers and the two can never
 * disagree.
 *
 * The duplication is deliberate and handled: this page is the canonical one for the
 * pricing content (platformPageMetadata sets the canonical, and the landing page's
 * structured data points its offers here), so a crawler seeing the table twice knows
 * which URL to credit.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Pricing",
    description:
      "Assess360 plans and prices: Gate $39, Signal $79, Agency $199 per month, Enterprise from $499. Disqualified visitors are never metered. 14-day trial, no card.",
    path: "/pricing",
  });
}

/**
 * Offers live here as well as on the landing page, with `url` pointing at THIS page
 * rather than the anchor, because this is the URL a pricing question should resolve to.
 */
const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "SoftwareApplication",
      name: MARKETING.name,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      description: MARKETING.description,
      url: MARKETING.domain + "/pricing",
      offers: TIERS.filter((t) => t.amount !== null).map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: String(t.amount),
        priceCurrency: "USD",
        url: MARKETING.domain + "/pricing",
        availability: "https://schema.org/InStock",
      })),
    },
    {
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: MARKETING.domain + "/" },
        { "@type": "ListItem", position: 2, name: "Pricing", item: MARKETING.domain + "/pricing" },
      ],
    },
  ],
};

export default async function PricingPage() {
  // Platform marketing has no business on a customer's domain: it would be our content on
  // their host, and a duplicate of the canonical page. Same rule as the pillar routes.
  if (await getCurrentTenant()) notFound();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav anchorBase="/" />
      <main id="main">
        <section className="border-b">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
              {MARKETING.name} pricing
            </h1>
            <p className="mt-4 max-w-2xl text-lg text-[var(--muted-foreground)]">
              Every plan carries the qualification gate and the Meta signal in full. What the
              tiers change is volume, your own branding and domain, AI reports, and the API.
            </p>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted-foreground)]">{TRIAL_NOTE}</p>
          </div>
        </section>

        <Pricing />

        <section className="border-b">
          <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
            <h2 className="text-xl font-semibold tracking-tight">Billing in one paragraph</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              Plans are billed in advance in USD, exclusive of taxes, and renew automatically
              until you cancel. After you cancel you are not charged again once your current
              billing period ends, and you keep using the service until that date. Payments are
              non-refundable. Full detail is in the{" "}
              <Link href="/refund" className="underline hover:text-[var(--foreground)]">
                Refund &amp; Cancellation Policy
              </Link>{" "}
              and the{" "}
              <Link href="/terms" className="underline hover:text-[var(--foreground)]">
                Terms of Service
              </Link>
              .
            </p>
          </div>
        </section>

        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

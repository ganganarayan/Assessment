import { MARKETING, TIERS, FAQS } from "@/lib/marketing/content";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { Metering } from "./Metering";
import { WhyThisExists } from "./WhyThisExists";
import { WhoItIsFor } from "./WhoItIsFor";
import { Problem } from "./Problem";
import { HowItWorks } from "./HowItWorks";
import { Capabilities } from "./Capabilities";
import { UseCases } from "./UseCases";
import { Pricing } from "./Pricing";
import { Faq } from "./Faq";
import { FinalCta } from "./FinalCta";
import { Footer } from "./Footer";

/**
 * Structured data. AI answer engines and comparison sites lean on this heavily for
 * pricing questions, so every tier carries a REAL price here - the old graph claimed
 * `price: "0"`, which was wrong the moment the free plan went and would have been
 * quoted back at us.
 *
 * Offers use the MONTHLY amount; the annual figure lives in the page's markup, where a
 * crawler reading the comparison table will find it.
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
      url: MARKETING.domain + "/",
      offers: TIERS.filter((t) => t.amount !== null).map((t) => ({
        "@type": "Offer",
        name: t.name,
        price: String(t.amount),
        priceCurrency: "USD",
        // The standalone /pricing page is the canonical home of this table; the "#pricing"
        // section below stays, but a pricing question should resolve to the page.
        url: MARKETING.domain + "/pricing",
        availability: "https://schema.org/InStock",
      })),
    },
    {
      "@type": "FAQPage",
      mainEntity: FAQS.map((f) => ({
        "@type": "Question",
        name: f.q,
        acceptedAnswer: { "@type": "Answer", text: f.a },
      })),
    },
    {
      // No `logo`: it pointed at /og-image.png, which has never existed in public/, so
      // the one property meant to prove the entity was a 404. A real square logo asset
      // is worth adding; a broken URL is not, and an absent property beats a dead one.
      "@type": "Organization",
      name: MARKETING.name,
      url: MARKETING.domain + "/",
    },
  ],
};

export function Landing({
  videos,
}: {
  videos?: { hero: string | null; tiles: Record<string, string> };
}) {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main id="main">
        <Hero video={videos?.hero ?? null} />
        {/* Directly under the hero: who built this and why, in seven lines somebody can
            skim. It answers "why should I believe any of this" before the page starts
            making claims, and it is the one section a competitor cannot answer by
            shipping a feature. */}
        <WhyThisExists />
        {/* Then the twenty audiences, so a reader can find their own line before the
            page argues anything. The list is the template library's own, so it cannot
            advertise an audience with nothing behind it. */}
        <WhoItIsFor />
        {/* Then the only claim on the page that can be checked against an invoice, which
            is worth more to a sceptical reader than the next three sections combined. */}
        <Metering />
        <Problem />
        <HowItWorks />
        <Capabilities videos={videos?.tiles} />
        <UseCases />
        <Pricing />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

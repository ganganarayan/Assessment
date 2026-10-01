import { MARKETING, TIERS, FAQS } from "@/lib/marketing/content";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
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
 * pricing questions, so every tier carries a REAL price here — the old graph claimed
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
        url: MARKETING.domain + "/#pricing",
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
      "@type": "Organization",
      name: MARKETING.name,
      url: MARKETING.domain + "/",
      logo: MARKETING.domain + MARKETING.ogImage,
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

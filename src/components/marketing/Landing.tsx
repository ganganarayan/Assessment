import { MARKETING, TIERS, FAQS } from "@/lib/marketing/content";
import { getCta } from "@/lib/settings/cta";
import { Nav } from "./Nav";
import { Hero } from "./Hero";
import { DisqualifiedCost } from "./DisqualifiedCost";
import { Metering } from "./Metering";
import { NoCrmNeeded } from "./NoCrmNeeded";
import { WhyThisExists } from "./WhyThisExists";
import { WhoItIsFor } from "./WhoItIsFor";
import { Problem } from "./Problem";
import { HowItWorks } from "./HowItWorks";
import { Capabilities } from "./Capabilities";
import { Mechanism } from "./Mechanism";
import { RealCost } from "./RealCost";
import { NoGoodLeadLost } from "./NoGoodLeadLost";
import { BuiltWithYou } from "./BuiltWithYou";
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

export async function Landing({
  videos,
}: {
  videos?: { hero: string | null; tiles: Record<string, string> };
}) {
  // Read once here for the two CLIENT components below (the pricing table and, on
  // other pages, the calculator). Every other section on this page is a server
  // component and asks getCta() for itself; the request-level cache makes that one
  // query either way.
  const cta = await getCta();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Nav />
      <main id="main">
        <Hero video={videos?.hero ?? null} />
        {/* The bill, itemised, line by line. It is first because every section after it
            answers a premise the reader has to accept before any of them matter: that a
            lead who will never buy is expensive, and expensive monthly. */}
        <DisqualifiedCost />
        {/* Then the same bill as arithmetic rather than a list - 40 calls, half of them
            wrong, 15 hours. The itemisation says what the charges ARE; this says what
            they come to. Both ask for nothing, because they are earning the attention
            the next five sections spend. */}
        <RealCost />
        {/* Then who built this and why, in seven lines somebody can skim. It answers
            "why should I believe any of this" before the page starts making claims, and
            it is the one section a competitor cannot answer by shipping a feature. */}
        <WhyThisExists />
        {/* The mechanism, split out of the capability grid and moved up. The three steps
            are the argument; nineteen cards are the evidence, and evidence after the
            claim reads very differently from evidence instead of it. */}
        <Mechanism />
        {/* The objection that actually kills this sale: fear of turning away someone
            good. It sits immediately after the mechanism because that is the moment the
            reader first pictures their own leads being thrown out. */}
        <NoGoodLeadLost />
        {/* Then the only claim on the page that can be checked against an invoice, which
            is worth more to a sceptical reader than the next three sections combined. */}
        <Metering />
        {/* The other money argument, next to the first one. Metering says what this
            costs; this says what it replaces, which is the sum a reader already paying
            for a CRM does by themselves. Two structural claims together, before the
            offer asks them to act on either. */}
        <NoCrmNeeded />
        {/* The offer, as a section rather than a strip nobody reads twice - placed where
            somebody who now believes the argument can act on it. */}
        <BuiltWithYou />
        {/* Then the twenty audiences, so a reader can find their own line. The list is
            the template library's own, so it cannot advertise an audience with nothing
            behind it. */}
        <WhoItIsFor />
        <Problem />
        <HowItWorks />
        <Capabilities videos={videos?.tiles} />
        <UseCases />
        <Pricing cta={cta} />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}

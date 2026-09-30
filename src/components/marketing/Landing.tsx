import { MARKETING } from "@/lib/marketing/content";
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
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
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

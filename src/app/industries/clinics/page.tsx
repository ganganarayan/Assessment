import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { IndustryPage } from "@/components/marketing/IndustryPage";
import { getIndustry } from "@/lib/marketing/industries";
import { MARKETING } from "@/lib/marketing/content";
import { platformPageMetadata, platformUrl } from "@/lib/seo/site";

/**
 * Lead qualification for aesthetic and elective clinics.
 *
 * Sibling of /industries/study-abroad, and distinct from the keyword page at
 * /lead-qualification-for-clinics: that one answers a search, this one is where
 * an emailed funnel audit lands. Same product, different reader, which is why
 * only this one leads with the audit and the arithmetic.
 */
export const dynamic = "force-dynamic";

const spec = getIndustry("clinics");

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: spec.meta.title,
    description: spec.meta.description,
    path: spec.path,
  });
}

export default async function ClinicsIndustryPage() {
  if (await getCurrentTenant()) notFound();

  const url = platformUrl(spec.path);
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: `${spec.meta.title} - ${MARKETING.name}`,
        description: spec.meta.description,
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: spec.objections.map((o) => ({
          "@type": "Question",
          name: o.q,
          acceptedAnswer: { "@type": "Answer", text: o.a },
        })),
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <IndustryPage spec={spec} />
    </>
  );
}

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { IndustryPage } from "@/components/marketing/IndustryPage";
import { getIndustry } from "@/lib/marketing/industries";
import { MARKETING } from "@/lib/marketing/content";
import { platformPageMetadata, platformUrl } from "@/lib/seo/site";

/**
 * Lead qualification for study-abroad consultancies.
 *
 * Platform-only, like every other marketing route: a tenant's own domain serves
 * their funnel, and an Assess360 sales page rendering inside a customer's brand
 * would be our offer on their host.
 *
 * `force-dynamic` because the announcement bar inside Nav reads the live slot
 * count, which is a settings lookup rather than build-time copy.
 */
export const dynamic = "force-dynamic";

const spec = getIndustry("study-abroad");

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: spec.meta.title,
    description: spec.meta.description,
    path: spec.path,
  });
}

export default async function StudyAbroadIndustryPage() {
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

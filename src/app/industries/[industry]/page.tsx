import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { IndustryPage } from "@/components/marketing/IndustryPage";
import { INDUSTRY_PAGES, findIndustry } from "@/lib/marketing/industries";
import { MARKETING } from "@/lib/marketing/content";
import { platformPageMetadata, platformUrl } from "@/lib/seo/site";

/**
 * Every by-industry page, from one route.
 *
 * These used to be a folder each, and at two industries that was honest: each
 * file named its own spec and carried its own comment. At twenty-one it would be
 * twenty-one copies of the same sixty lines, which is twenty-one places for the
 * JSON-LD or the tenant guard to be subtly different. The spec is data, the page
 * is a renderer, and the segment is the key.
 *
 * Platform-only, like every other marketing route: a tenant's own domain serves
 * their funnel, and an Assess360 sales page rendering inside a customer's brand
 * would be our offer on their host.
 *
 * `force-dynamic` because the announcement bar inside Nav reads the live slot
 * count, and because the leak calculator opens in the visitor's own currency,
 * which is a request header rather than build-time copy.
 */
export const dynamic = "force-dynamic";

/**
 * The known segments, listed for the router even though nothing is prerendered.
 *
 * With force-dynamic this does not build pages ahead of time. It does tell Next
 * which segments are real, which keeps the route honest about its own surface
 * and means a typo in a link is a 404 at the edge of the registry rather than a
 * page that renders empty.
 */
export function generateStaticParams(): Array<{ industry: string }> {
  return INDUSTRY_PAGES.map((p) => ({ industry: p.key }));
}

type Params = { params: Promise<{ industry: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { industry } = await params;
  const spec = findIndustry(industry);
  if (!spec) return {};
  return platformPageMetadata({
    title: spec.meta.title,
    description: spec.meta.description,
    path: spec.path,
  });
}

export default async function IndustryRoute({ params }: Params) {
  const { industry } = await params;
  const spec = findIndustry(industry);
  if (!spec) notFound();
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

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { getPage, answersForTopic, resolvePages } from "@/lib/seo/registry";
import { pillarGraph } from "@/lib/seo/schema";
import { SeoPageShell } from "@/features/seo/components/seo-page-shell";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * Pillar pages, served at the root: /lead-qualification-software, not /guides/… .
 *
 * The slug IS the head term, and a folder in front of it only dilutes the clearest
 * signal a URL carries. A root-level dynamic segment is safe here because every other
 * root route is static, and Next matches static before dynamic — so this catches exactly
 * the paths nothing else claimed, and hands the genuinely unknown ones to notFound().
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ seoPage: string }>;
}): Promise<Metadata> {
  const { seoPage } = await params;
  const page = getPage(seoPage);
  if (!page) return {};
  return platformPageMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
}

export default async function SeoPageRoute({ params }: { params: Promise<{ seoPage: string }> }) {
  const { seoPage } = await params;

  // These pages are the PLATFORM's marketing. A tenant's own domain has no business
  // serving them: it would put our content on a customer's host, which is both confusing
  // for their visitors and a duplicate of the canonical page.
  if (await getCurrentTenant()) notFound();

  const page = getPage(seoPage);
  if (!page) notFound();

  const answers = page.topicId ? answersForTopic(page.topicId) : [];
  const related = resolvePages(page.internalLinks);
  const jsonLd = await pillarGraph(page, answers);

  return <SeoPageShell page={page} answers={answers} related={related} jsonLd={jsonLd} />;
}

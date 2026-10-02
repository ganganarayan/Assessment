import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { getPage, answersForTopic, resolvePages } from "@/lib/seo/registry";
import { pillarGraph } from "@/lib/seo/schema";
import { SeoPageShell } from "@/features/seo/components/seo-page-shell";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * The shared body of every pillar route, so each route file is a two-line binding.
 *
 * Pillars are bound to STATIC routes rather than one root-level `[slug]` catch-all, which
 * is what this originally was. The catch-all worked, but it quietly broke the
 * `no-html-link-for-pages` lint rule across the whole repo: with a dynamic segment at the
 * root, that rule starts treating arbitrary paths as pages and fails the build on `<a>`
 * tags in seven unrelated files — including download endpoints under /api that have to be
 * plain anchors. Explicit routes keep the clean root URL, keep the lint rule honest, let
 * Next match statically, and leave unknown paths to 404 on their own.
 *
 * Forgetting to add the route file when adding content would be a silent 404, so
 * verify-seo asserts that every page in the registry has one.
 */
export async function pillarMetadata(slug: string): Promise<Metadata> {
  const page = getPage(slug);
  if (!page) return {};
  return platformPageMetadata({
    title: page.title,
    description: page.description,
    path: `/${page.slug}`,
  });
}

export async function PillarRoute({ slug }: { slug: string }) {
  // Platform marketing has no business on a customer's domain: it would be our content
  // on their host, and a duplicate of the canonical page.
  if (await getCurrentTenant()) notFound();

  const page = getPage(slug);
  if (!page) notFound();

  const answers = page.topicId ? answersForTopic(page.topicId) : [];
  const jsonLd = await pillarGraph(page, answers);

  return (
    <SeoPageShell
      page={page}
      answers={answers}
      related={resolvePages(page.internalLinks)}
      jsonLd={jsonLd}
    />
  );
}

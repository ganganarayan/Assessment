import "server-only";
import { MARKETING, TIERS } from "@/lib/marketing/content";
import { getEntityFacts } from "@/lib/legal/config";
import { absolute, answerUrl, seoUrl } from "./urls";
import type { Answer, SeoPage } from "./types";

/**
 * The structured-data graph.
 *
 * Built around stable @id anchors rather than repeating the same entity on every page.
 * That is the difference between telling a search engine "there is an organisation called
 * Assess360" forty times and telling it "there is ONE organisation, and these forty pages
 * all belong to it" - the second is what an entity graph is for, and it is what AI answer
 * engines lean on when they decide whether a claim has a publisher behind it.
 *
 * Nothing here is invented. No ratings, no review counts, no awards, no customer numbers.
 * Fields sourced from Settings are OMITTED when unset: a missing property leaves the
 * graph incomplete, while a placeholder makes it false, and only one of those is
 * recoverable later.
 */
const ORG_ID = absolute("/#organization");
const SITE_ID = absolute("/#website");
const SOFTWARE_ID = absolute("/#software");

type Node = Record<string, unknown>;

/** Drop keys whose value is null/undefined, so unset facts never reach the output. */
function compact(node: Node): Node {
  return Object.fromEntries(Object.entries(node).filter(([, v]) => v !== null && v !== undefined));
}

/**
 * Organization, WebSite and SoftwareApplication - the three nodes every page references
 * and none of them repeats.
 *
 * `name` is the brand people search for; `legalName` is the registered entity. They are
 * different things and conflating them is how a company ends up with two half-entities
 * instead of one whole one.
 */
async function entityNodes(): Promise<Node[]> {
  const facts = await getEntityFacts();

  const organization = compact({
    "@type": "Organization",
    "@id": ORG_ID,
    name: MARKETING.name,
    // Spacing variant + a sentence saying what this entity IS. Both exist to answer the
    // question the name alone cannot: WHICH Assess360 is this. Three unrelated entities
    // use the name or a near variant, so leaving the brand undescribed leaves the
    // association to be inferred from whichever page a crawler happens to read.
    alternateName: MARKETING.alternateName,
    description: MARKETING.organizationDescription,
    legalName: facts.legalName,
    url: absolute("/"),
    address: facts.address,
    taxID: facts.taxId,
    foundingDate: facts.foundedOn,
    email: facts.contactEmail,
  });

  const website = {
    "@type": "WebSite",
    "@id": SITE_ID,
    name: MARKETING.name,
    // Google reads name/alternateName on the WebSite node when it picks the site name
    // shown above a result, which is the most visible brand signal there is.
    alternateName: MARKETING.alternateName,
    url: absolute("/"),
    publisher: { "@id": ORG_ID },
    inLanguage: "en",
  };

  const software = {
    "@type": "SoftwareApplication",
    "@id": SOFTWARE_ID,
    name: MARKETING.name,
    alternateName: MARKETING.alternateName,
    applicationCategory: "BusinessApplication",
    // The category in the product's own words. applicationCategory is a fixed schema.org
    // vocabulary ("BusinessApplication" is as specific as it gets); the subcategory is
    // free text, and it is where "Lead Qualification Software" belongs.
    applicationSubCategory: "Lead Qualification Software",
    operatingSystem: "Web",
    description: MARKETING.description,
    url: absolute("/"),
    publisher: { "@id": ORG_ID },
    offers: TIERS.filter((t) => t.amount !== null).map((t) => ({
      "@type": "Offer",
      name: t.name,
      price: String(t.amount),
      priceCurrency: "USD",
      url: absolute("/#pricing"),
      availability: "https://schema.org/InStock",
    })),
  };

  return [organization, website, software];
}

function breadcrumb(url: string, trail: ReadonlyArray<{ name: string; url: string }>): Node {
  return {
    "@type": "BreadcrumbList",
    "@id": `${url}#breadcrumb`,
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function faqNode(url: string, qa: ReadonlyArray<{ q: string; a: string }>): Node {
  return {
    "@type": "FAQPage",
    "@id": `${url}#faq`,
    mainEntity: qa.map((x) => ({
      "@type": "Question",
      name: x.q,
      acceptedAnswer: { "@type": "Answer", text: x.a },
    })),
  };
}

function graph(nodes: Node[]): string {
  return JSON.stringify({ "@context": "https://schema.org", "@graph": nodes });
}

/**
 * A pillar page: the WebPage, its breadcrumb, and an FAQPage built from the one-sentence
 * answers of the cluster it owns. The long form of each lives on its own URL, so what
 * goes in the graph here is the short answer and nothing more.
 */
export async function pillarGraph(page: SeoPage, answers: ReadonlyArray<Answer>): Promise<string> {
  const url = seoUrl(page.slug);
  const nodes = await entityNodes();

  nodes.push({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: page.title,
    description: page.description,
    isPartOf: { "@id": SITE_ID },
    about: { "@id": SOFTWARE_ID },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    inLanguage: "en",
    dateModified: page.updatedAt,
  });
  nodes.push(breadcrumb(url, [
    { name: "Home", url: absolute("/") },
    { name: page.shortName, url },
  ]));
  if (answers.length > 0) {
    nodes.push(faqNode(url, answers.map((a) => ({ q: a.question, a: a.short }))));
  }

  return graph(nodes);
}

/**
 * A knowledge-base answer: one question, so a single-entry FAQPage. The short answer is
 * what goes in `acceptedAnswer` - it is the sentence written to be quoted, and feeding a
 * crawler the whole body here would only duplicate what is already in the HTML below it.
 */
export async function answerGraph(answer: Answer, topicTitle: string): Promise<string> {
  const url = answerUrl(answer.slug);
  const nodes = await entityNodes();

  nodes.push({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: answer.question,
    description: answer.short,
    isPartOf: { "@id": SITE_ID },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    inLanguage: "en",
    dateModified: answer.updatedAt,
  });
  nodes.push(breadcrumb(url, [
    { name: "Home", url: absolute("/") },
    { name: "Answers", url: absolute("/answers") },
    { name: topicTitle, url: absolute("/answers") },
    { name: answer.question, url },
  ]));
  nodes.push(faqNode(url, [{ q: answer.question, a: answer.short }]));

  return graph(nodes);
}

/** The knowledge-base index: a WebPage plus its breadcrumb. No FAQ node - the index is a
 *  list of questions, and claiming it answers them would be a claim about the wrong page. */
export async function answersIndexGraph(): Promise<string> {
  const url = absolute("/answers");
  const nodes = await entityNodes();
  nodes.push({
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    url,
    name: "Answers",
    isPartOf: { "@id": SITE_ID },
    breadcrumb: { "@id": `${url}#breadcrumb` },
    inLanguage: "en",
  });
  nodes.push(breadcrumb(url, [
    { name: "Home", url: absolute("/") },
    { name: "Answers", url },
  ]));
  return graph(nodes);
}

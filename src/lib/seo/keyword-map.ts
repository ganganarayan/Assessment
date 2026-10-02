import { ANSWERS, PAGES, TOPICS } from "./registry";
import { answerPath, seoPath } from "./urls";

/**
 * The keyword map, DERIVED from the content rather than maintained beside it.
 *
 * A hand-kept map and a hand-kept set of pages drift within weeks, and the drift is
 * silent — the map still looks authoritative while describing a site that no longer
 * exists. Generating it means the map cannot be wrong about what we published; it can
 * only be wrong about what we should have.
 *
 * The rule it exists to enforce: every term belongs to exactly ONE page. Two of our own
 * pages bidding for the same query is the commonest way a content cluster underperforms,
 * and it is invisible until months of data say so.
 */
export interface KeywordOwner {
  term: string;
  url: string;
  /** "primary" = the page is built to win this term. "secondary" = supporting. */
  role: "primary" | "secondary";
}

export interface KeywordMap {
  clusters: Array<{
    topic: string;
    title: string;
    pillar: string;
    terms: KeywordOwner[];
  }>;
  /** Flat term → url, so a collision is a key collision. */
  index: Record<string, string>;
  collisions: Array<{ term: string; urls: string[] }>;
}

function termsFor(url: string, primary: string, secondary: readonly string[]): KeywordOwner[] {
  return [
    { term: primary, url, role: "primary" as const },
    ...secondary.map((term) => ({ term, url, role: "secondary" as const })),
  ];
}

export function buildKeywordMap(): KeywordMap {
  const all: KeywordOwner[] = [
    ...PAGES.flatMap((p) => termsFor(seoPath(p.slug), p.primaryKeyword, p.secondaryKeywords)),
    ...ANSWERS.flatMap((a) => termsFor(answerPath(a.slug), a.primaryKeyword, a.secondaryKeywords)),
  ];

  const byTerm = new Map<string, KeywordOwner[]>();
  for (const owner of all) {
    const key = owner.term.trim().toLowerCase();
    byTerm.set(key, [...(byTerm.get(key) ?? []), owner]);
  }

  const index: Record<string, string> = {};
  const collisions: KeywordMap["collisions"] = [];
  for (const [term, owners] of [...byTerm.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const urls = [...new Set(owners.map((o) => o.url))];
    if (urls.length > 1) collisions.push({ term, urls });
    // The primary owner wins the index entry; otherwise the first claimant does.
    index[term] = (owners.find((o) => o.role === "primary") ?? owners[0]!).url;
  }

  const clusters = TOPICS.map((t) => {
    const pillar = PAGES.find((p) => p.slug === t.pillarSlug);
    const pillarUrl = pillar ? seoPath(pillar.slug) : "";
    const answerUrls = new Set(ANSWERS.filter((a) => a.topicId === t.id).map((a) => answerPath(a.slug)));
    return {
      topic: t.id,
      title: t.title,
      pillar: pillarUrl,
      terms: all
        .filter((o) => o.url === pillarUrl || answerUrls.has(o.url))
        .sort((a, b) => a.term.localeCompare(b.term)),
    };
  });

  return { clusters, index, collisions };
}

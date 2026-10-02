import { answerSchema, seoPageSchema, topicSchema, type Answer, type SeoPage, type Topic } from "./types";
import { ANSWER_SOURCES, PAGE_SOURCES, TOPICS as TOPIC_SOURCES } from "@/content/seo";

/**
 * The validated content registry — the single door every surface reads content through.
 *
 * Shape is validated HERE, at module load, because a malformed answer should never
 * render. Cross-references (does this related slug exist, is this keyword claimed twice)
 * are NOT enforced here: throwing on a dangling link would take the whole site down over
 * a typo in one file. They are reported by `auditContent` instead, which the verify
 * script turns into a build failure — loud where it is cheap, defensive where it is not.
 */
function parseAll<T>(items: readonly unknown[], schema: { parse(v: unknown): T }, kind: string): T[] {
  return items.map((item, i) => {
    try {
      return schema.parse(item);
    } catch (err) {
      // Naming the index and kind turns an unreadable Zod dump into something findable.
      throw new Error(`Invalid ${kind} at index ${i}: ${err instanceof Error ? err.message : err}`);
    }
  });
}

export const TOPICS: ReadonlyArray<Topic> = parseAll(TOPIC_SOURCES, topicSchema, "topic");
export const ANSWERS: ReadonlyArray<Answer> = parseAll(ANSWER_SOURCES, answerSchema, "answer");
export const PAGES: ReadonlyArray<SeoPage> = parseAll(PAGE_SOURCES, seoPageSchema, "page");

const ANSWER_BY_SLUG = new Map(ANSWERS.map((a) => [a.slug, a]));
const PAGE_BY_SLUG = new Map(PAGES.map((p) => [p.slug, p]));
const TOPIC_BY_ID = new Map(TOPICS.map((t) => [t.id, t]));

export function getAnswer(slug: string): Answer | undefined {
  return ANSWER_BY_SLUG.get(slug);
}
export function getPage(slug: string): SeoPage | undefined {
  return PAGE_BY_SLUG.get(slug);
}
export function getTopic(id: string): Topic | undefined {
  return TOPIC_BY_ID.get(id);
}

/**
 * Every answer in a cluster, oldest-question-first by slug for a stable order.
 *
 * Pillars list the WHOLE cluster rather than a curated handful: a reader who wants the
 * detail should find all of it in one place, and an answer that exists but is linked
 * from nowhere is an orphan no crawler has a reason to reach.
 */
export function answersForTopic(topicId: string): Answer[] {
  return ANSWERS.filter((a) => a.topicId === topicId).sort((a, b) => a.slug.localeCompare(b.slug));
}

/** Resolve a list of answer slugs, silently dropping any that no longer exist. */
export function resolveAnswers(slugs: readonly string[]): Answer[] {
  return slugs.map((s) => ANSWER_BY_SLUG.get(s)).filter((a): a is Answer => Boolean(a));
}

/** Resolve a list of page slugs, silently dropping any that no longer exist. */
export function resolvePages(slugs: readonly string[]): SeoPage[] {
  return slugs.map((s) => PAGE_BY_SLUG.get(s)).filter((p): p is SeoPage => Boolean(p));
}

/** Previous/next within a cluster, for the knowledge base's sticky pager. */
export function answerNeighbours(answer: Answer): { prev: Answer | null; next: Answer | null } {
  const siblings = answersForTopic(answer.topicId);
  const i = siblings.findIndex((a) => a.slug === answer.slug);
  return {
    prev: i > 0 ? (siblings[i - 1] ?? null) : null,
    next: i >= 0 && i < siblings.length - 1 ? (siblings[i + 1] ?? null) : null,
  };
}

export interface ContentProblem {
  where: string;
  problem: string;
}

/**
 * Every cross-file rule the per-file schema cannot see.
 *
 * The keyword rule is the important one and the reason this exists: a pillar and one of
 * its own answers competing for the same query is the single most common way a content
 * cluster underperforms, and it is invisible until months of data say so. Here it is a
 * failing build instead.
 */
export function auditContent(): ContentProblem[] {
  const problems: ContentProblem[] = [];

  const topicIds = new Set(TOPICS.map((t) => t.id));
  for (const t of TOPICS) {
    if (!PAGE_BY_SLUG.has(t.pillarSlug)) {
      problems.push({ where: `topic/${t.id}`, problem: `pillarSlug "${t.pillarSlug}" has no page` });
    }
  }

  for (const a of ANSWERS) {
    if (!topicIds.has(a.topicId)) {
      problems.push({ where: `answer/${a.slug}`, problem: `unknown topicId "${a.topicId}"` });
    }
    for (const r of a.related) {
      if (!ANSWER_BY_SLUG.has(r)) {
        problems.push({ where: `answer/${a.slug}`, problem: `related "${r}" does not exist` });
      }
      if (r === a.slug) {
        problems.push({ where: `answer/${a.slug}`, problem: "related links to itself" });
      }
    }
  }

  for (const p of PAGES) {
    if (p.topicId && !topicIds.has(p.topicId)) {
      problems.push({ where: `page/${p.slug}`, problem: `unknown topicId "${p.topicId}"` });
    }
    for (const l of p.internalLinks) {
      if (!PAGE_BY_SLUG.has(l)) {
        problems.push({ where: `page/${p.slug}`, problem: `internalLink "${l}" does not exist` });
      }
    }
  }

  // An answer nobody can reach from a pillar is an orphan: indexed, unlinked, unranked.
  const reachable = new Set(TOPICS.flatMap((t) => answersForTopic(t.id).map((a) => a.slug)));
  for (const a of ANSWERS) {
    if (!reachable.has(a.slug)) {
      problems.push({ where: `answer/${a.slug}`, problem: "not reachable from any pillar" });
    }
  }

  // One keyword, one primary page. Pillars own head terms; answers own question forms.
  const claimed = new Map<string, string>();
  for (const p of PAGES) claimed.set(normalise(p.primaryKeyword), `page/${p.slug}`);
  for (const a of ANSWERS) {
    const k = normalise(a.primaryKeyword);
    const existing = claimed.get(k);
    if (existing) {
      problems.push({
        where: `answer/${a.slug}`,
        problem: `primaryKeyword "${a.primaryKeyword}" is already primary on ${existing}`,
      });
    } else {
      claimed.set(k, `answer/${a.slug}`);
    }
  }

  return problems;
}

function normalise(keyword: string): string {
  return keyword.trim().toLowerCase().replace(/\s+/g, " ");
}

import { z } from "zod";

/**
 * The content model behind BOTH public surfaces — the pillar pages and the knowledge
 * base — because they are two views of one body of work, not two bodies of work.
 *
 * The atomic unit is an ANSWER: one real question, written once, in one file. A pillar
 * composes many of them; a KB page renders exactly one. That is the whole reason this
 * model exists, and it is what stops the knowledge base from being a second project that
 * rewrites everything the pillars already said.
 *
 * Every answer carries its content at two lengths, and the split is load-bearing:
 *
 *   short — ONE sentence. What a person understands without reading on, and what an AI
 *           answer engine lifts when it cites us. Hard-capped, because an unbounded
 *           "short" becomes a paragraph within a month.
 *   body  — the full treatment, still brief. Short, not thin: an answer page that cannot
 *           say something specific does not deserve a URL, and the floor below is what
 *           keeps the knowledge base from degenerating into doorway pages.
 *
 * Zod rather than types alone because this content is authored by hand over months. A
 * type is checked when someone runs tsc; a schema is checked on every build, and the
 * verify script turns a vague "looks fine" into a failure with a filename on it.
 */

/** Slug shape shared by answers, pages and topics: lowercase, hyphenated, no edges. */
const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "slug must be lowercase words joined by hyphens");

/** ISO date (YYYY-MM-DD). Drives sitemap lastmod, so it must be a real date. */
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

/**
 * A topic cluster. Every answer belongs to exactly one, and every cluster is owned by
 * exactly one pillar — the rule that keeps two of our own pages from competing for the
 * same query.
 */
export const topicSchema = z.object({
  id: slug,
  /** SHORT category name, e.g. "Lead qualification". Used in breadcrumbs, where the
   *  branded form would be too long to read. */
  title: z.string().min(3),
  /** The branded heading shown on the knowledge-base index. Separate from `title`
   *  because a breadcrumb and a section heading want different lengths. */
  heading: z.string().min(3),
  /** The pillar page that owns this cluster, by page slug. */
  pillarSlug: slug,
  /** One line, used on the knowledge-base index. */
  blurb: z.string().min(20).max(200),
});
export type Topic = z.infer<typeof topicSchema>;

/**
 * One section of a pillar page. `answer` comes FIRST and is required, which is the
 * structural expression of the brief: nobody reads a long page, so every section states
 * its conclusion in a sentence or two before it explains anything. A reader skims the
 * answers; a crawler gets the depth underneath them.
 */
export const sectionSchema = z.object({
  /** Anchor id, also the table-of-contents target. */
  id: slug,
  /** Phrased as a heading a person would search, not a label. */
  heading: z.string().min(8),
  /** The direct answer. One or two sentences, before any elaboration. */
  answer: z.string().min(40).max(400),
  paragraphs: z.array(z.string().min(40)).default([]),
  bullets: z.array(z.string().min(10)).default([]),
});
export type Section = z.infer<typeof sectionSchema>;

/**
 * A knowledge-base answer.
 *
 * The length bounds are the quality gate. `short` is capped at a sentence so it stays
 * quotable. `body` has a FLOOR, not a ceiling: at least two sections, because a page
 * that can manage only one is a sentence pretending to be a document, and that is the
 * thin-page failure the brief forbids.
 */
export const answerSchema = z.object({
  slug,
  /** A real user question, phrased the way it is typed. */
  question: z.string().min(10).max(120),
  /** ONE sentence. The whole answer, for someone who reads nothing else. */
  short: z
    .string()
    .min(40)
    .max(260)
    .refine((s) => !/\.\s+\S/.test(s.trim().replace(/\.$/, "")), {
      message: "short must be a single sentence — move the rest into body",
    }),
  /** The short expansion. Short, but never empty: see the floor above. */
  body: z.array(sectionSchema).min(2, "an answer page needs at least two sections"),
  topicId: slug,
  /** The question-shaped query this answer owns. Never a head term — pillars own those. */
  primaryKeyword: z.string().min(3),
  secondaryKeywords: z.array(z.string().min(3)).default([]),
  /** Other answers worth reading next, by slug. Validated to exist. */
  related: z.array(slug).default([]),
  updatedAt: isoDate,
});
export type Answer = z.infer<typeof answerSchema>;

/** What kind of page this is. Drives breadcrumbs and which schema types are emitted. */
export const pageKindSchema = z.enum(["pillar", "use-case", "comparison", "glossary"]);
export type PageKind = z.infer<typeof pageKindSchema>;

/**
 * A pillar or other composed page.
 *
 * It owns a HEAD term ("lead qualification software") while its answers own the question
 * forms ("what is lead qualification software"). Keeping those apart is what stops our
 * own pages cannibalising each other, and verify-seo fails the build if a keyword is
 * claimed as primary in two places.
 */
export const seoPageSchema = z.object({
  slug,
  kind: pageKindSchema,
  /** Plain statement of who is searching this and what they want. Editorial discipline. */
  intent: z.string().min(30),
  primaryKeyword: z.string().min(3),
  secondaryKeywords: z.array(z.string().min(3)).default([]),
  /** The <title>, without the brand — the layout template appends it. */
  title: z.string().min(15).max(70),
  description: z.string().min(70).max(165),
  /** The branded H1, e.g. "Assess360 — lead qualification software". It keeps the head
   *  term, because that is the query the page exists to answer, and puts a name to who is
   *  answering it — a page that explains a category without saying who built it educates
   *  the reader and sells for somebody else. */
  h1: z.string().min(10),
  /** The SHORT name for navigation, breadcrumbs and cross-links. The branded H1 repeated
   *  six times down a footer column is noise, not branding. */
  shortName: z.string().min(3),
  /** The answer-first opener: what this page says, before the page says it. */
  lede: z.string().min(80).max(500),
  sections: z.array(sectionSchema).min(2),
  /** The cluster whose answers this page lists. Every answer in it, not a chosen few. */
  topicId: slug.optional(),
  /** Other pages to link to, by slug. Validated to exist. */
  internalLinks: z.array(slug).default([]),
  cta: z.object({ heading: z.string().min(10), body: z.string().min(30) }),
  updatedAt: isoDate,
});
export type SeoPage = z.infer<typeof seoPageSchema>;

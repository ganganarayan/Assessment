import { caseStudySchema, type CaseStudy, type CaseStudyInput } from "@/lib/case-studies/types";

/**
 * The case studies, in publication order.
 *
 * 🟡 EMPTY ON PURPOSE, today. The template exists so that the first done-for-you install
 * that produces real numbers can be published in one commit rather than waiting on a
 * page to be designed first. Until then the index and every study route 404, which is
 * the correct behaviour: an empty "Case studies" page on a site whose whole argument is
 * about proof is worse than no page at all.
 *
 * To add one: drop a file beside this, import it here, fill in whatever numbers the
 * customer actually gave you, and set published to true when they have signed it off.
 */
const SOURCES: ReadonlyArray<CaseStudyInput> = [];

export const CASE_STUDIES: ReadonlyArray<CaseStudy> = SOURCES.map((s, i) => {
  const parsed = caseStudySchema.safeParse(s);
  if (!parsed.success) {
    // Fail at import, loudly, with the slug in the message. A half-valid case study is
    // a page with a blank where a number about a real customer should be.
    const where = (s as { slug?: string }).slug ?? `#${i}`;
    throw new Error(`case study ${where} is invalid: ${parsed.error.issues[0]?.message ?? "unknown"}`);
  }
  return parsed.data;
});

/** Only the ones signed off. Nothing else is ever served. */
export const publishedCaseStudies = (): ReadonlyArray<CaseStudy> =>
  CASE_STUDIES.filter((c) => c.published);

export const caseStudyBySlug = (slug: string): CaseStudy | null =>
  publishedCaseStudies().find((c) => c.slug === slug) ?? null;

/**
 * Result-page library: the plain vocabulary, shared by server and client.
 *
 * A ResultPageDoc is one result page as a record of its own - a name, a slug, a draft,
 * a published snapshot - bound to at most one assessment. There are two kinds, and
 * each keeps the content shape its builder already used:
 *
 *   RESULTS  the page shown after the questions. Draft = AssessmentPage rows pointing
 *            at the doc; published = AssessmentPageData[].
 *   VSL      the marketing page on the token link. Draft and published are both
 *            ResultPageData (theme + ordered blocks).
 *
 * No "use server" here: these are constants and pure functions, imported by the
 * library screens on the client as well as by the actions.
 */

export const RESULT_PAGE_KINDS = ["RESULTS", "VSL"] as const;
export type DocKind = (typeof RESULT_PAGE_KINDS)[number];

export function isDocKind(v: string): v is DocKind {
  return (RESULT_PAGE_KINDS as readonly string[]).includes(v);
}

/** What each kind is called on screen. Matches the builder's step names. */
export const KIND_LABEL: Record<DocKind, string> = {
  RESULTS: "Results page",
  VSL: "VSL result page",
};

export const KIND_BLURB: Record<DocKind, string> = {
  RESULTS:
    "The page shown straight after the questions - write-up, video, the respondent's band and the category breakdown with scores blurred, and the payment button.",
  VSL: "The marketing page delivered on the token link - eyebrow, headline, the respondent's AI statement, your video, booking buttons and testimonials.",
};

/** Where a doc of this kind is edited and bound. */
export const KIND_STEP: Record<DocKind, string> = {
  RESULTS: "12. Results page",
  VSL: "13. VSL result page",
};

/** One library row, as the list screens draw it. */
export interface DocRow {
  id: string;
  kind: DocKind;
  title: string;
  slug: string;
  /** Pages (RESULTS) or blocks (VSL) in the DRAFT - "how much is in here". */
  size: number;
  published: boolean;
  publishedAt: string | null;
  updatedAt: string;
  /** The one assessment this page is bound to, or null when it is free to use. */
  boundTo: { id: string; title: string } | null;
  /** The doc it was cloned from, for provenance only. */
  sourceSlug: string | null;
}

/**
 * A library slug: lowercase, dash-separated, no leading or trailing dash.
 *
 * Deliberately not a public URL (a respondent always lands on
 * /a/<assessment-slug>/r/<id>?t=...), so this only has to be stable, readable and
 * unique inside one workspace.
 */
export function slugifyDocTitle(input: string): string {
  const base = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "result-page";
}

/** "<slug>-copy", then "-copy-2", "-copy-3", … - the same shape the assessment
 *  duplicator uses, so a cloned page reads like a cloned funnel. */
export function copySlugCandidates(slug: string): (n: number) => string {
  const base = `${slug}-copy`;
  return (n: number) => (n <= 1 ? base : `${base}-${n}`);
}

/** "<title> (Copy)", and never "(Copy) (Copy) (Copy)" for a chain of clones. */
export function copyTitle(title: string): string {
  const stripped = title.replace(/\s*\(Copy(?: \d+)?\)\s*$/i, "");
  return `${stripped} (Copy)`;
}

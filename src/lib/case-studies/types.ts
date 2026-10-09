import { z } from "zod";

/**
 * A customer case study.
 *
 * Content files rather than a database table, deliberately. These are written by hand,
 * reviewed before they go out, and changed rarely - which is a repo's job, not a CMS's.
 * It also means a case study cannot reach the site without passing through a commit, and
 * published numbers about a named customer is exactly the kind of content that should
 * have to.
 *
 * 🔴 Every numeric field is OPTIONAL except the ones the comparison depends on. A case
 * study missing its close rate is still worth publishing; a case study that invents one
 * to fill the template is worth nothing and is a liability besides. The renderer leaves
 * out what it is not given rather than printing a zero.
 */

const slug = z
  .string()
  .min(3)
  .regex(/^[a-z0-9-]+$/, "a case-study slug is lowercase letters, numbers and hyphens");

/** The before/after pair, in whichever fields the customer actually gave us. */
export const metricsSchema = z.object({
  leadsPerMonth: z.number().nonnegative().optional(),
  callsBooked: z.number().nonnegative().optional(),
  wrongFitCalls: z.number().nonnegative().optional(),
  closeRatePct: z.number().min(0).max(100).optional(),
  /** After only: what a qualified lead ended up costing. */
  costPerQualifiedLead: z.string().min(1).optional(),
});
export type Metrics = z.infer<typeof metricsSchema>;

export const caseStudySchema = z.object({
  slug,
  /** The headline claim, in the customer's terms rather than ours. */
  title: z.string().min(10).max(90),
  description: z.string().min(70).max(165),
  /** Named, or "a coaching business" when they would rather not be. Both are fine. */
  client: z.string().min(2),
  industry: z.string().min(2),
  /** A band, never an exact figure: an exact ad spend identifies a competitor's budget. */
  adSpendBand: z.string().min(2),
  trafficSource: z.string().min(2),
  before: metricsSchema,
  after: metricsSchema,
  /** The gate questions actually used. The most copied part of any case study. */
  gateQuestions: z.array(z.string().min(10)).min(1),
  /** One line, in their words. */
  quote: z.string().min(20).max(300),
  quoteAttribution: z.string().min(2).optional(),
  /** Public paths under /public, or absolute URLs. Absent = the section is not rendered. */
  scorecardImage: z.string().min(1).optional(),
  resultImage: z.string().min(1).optional(),
  /** Free prose, each entry a paragraph. */
  body: z.array(z.string().min(40)).min(1),
  /**
   * 🔴 Unpublished by default, and it has to stay that way. A case study names a real
   * customer and prints their numbers; the state where it exists in the repo but is not
   * yet live is the state a draft spends most of its life in.
   */
  published: z.boolean().default(false),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type CaseStudy = z.infer<typeof caseStudySchema>;
export type CaseStudyInput = z.input<typeof caseStudySchema>;

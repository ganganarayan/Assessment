import { z } from "zod";
import { assessmentBodyExport } from "@/features/assessment/transfer/schema";

/**
 * The Template document - what a JSON file in prisma/templates holds, and what a
 * row's `body` is validated against before it is ever turned into an assessment.
 *
 * `body` reuses `assessmentBodyExport` verbatim. That is the point of this whole
 * design: the portable transfer format already carries every field, gate, result page
 * and band an assessment has, so a template needs no second format and import needs no
 * second code path. A field added to the transfer format arrives here for free.
 */
export const TEMPLATE_SHAPES = ["GATE_ONLY", "GATED_ASSESSMENT", "UNGATED_ASSESSMENT"] as const;
export type TemplateShapeId = (typeof TEMPLATE_SHAPES)[number];

/** What each shape MEANS, in the words a tenant choosing one needs. */
export const SHAPE_LABELS: Record<TemplateShapeId, string> = {
  GATE_ONLY: "Screening only",
  GATED_ASSESSMENT: "Screen, then score",
  UNGATED_ASSESSMENT: "Score everyone",
};

export const SHAPE_HINTS: Record<TemplateShapeId, string> = {
  GATE_ONLY: "Five questions decide who is worth a call. Nobody is scored.",
  GATED_ASSESSMENT: "The gate filters first, then whoever passes takes the scored assessment.",
  UNGATED_ASSESSMENT: "No gate - everyone who arrives takes the scored assessment.",
};

/**
 * The audience buckets the library is grouped by. A plain list rather than a DB enum,
 * so adding "Dentists" is a one-line change and never a migration. A category typed
 * on a contribution that is not in this list is kept as-is and simply sorts last.
 */
export const TEMPLATE_CATEGORIES = [
  "Coaches",
  "Healers",
  "Astrologers",
  "B2B SaaS",
  "Agencies",
  "Consultants",
  "Clinics",
  "Real estate",
  // The second wave of built-ins, one audience each. Appended rather than sorted in:
  // categoryRank keeps this authored order on the shelf, so inserting a name in the
  // middle would silently re-order a library the owner has already arranged.
  "Overseas education",
  "Interior design",
  "Franchise",
  "Solar and EV",
  "Financial advisers",
  "Law firms",
  "IT services",
  "Home services",
  "Course creators",
  "Insurance brokers",
  "Webinars",
  "Recruiters",
] as const;

export const templateDocSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9-]+$/, "Template slug must be lowercase letters, numbers and hyphens."),
  title: z.string().min(1),
  category: z.string().min(1),
  summary: z.string().nullable().optional(),
  shape: z.enum(TEMPLATE_SHAPES),
  /** Suggested result-statement instructions. Null/absent = this template ships without
   *  an AI statement, which is a deliberate variant, not an omission. */
  aiInstructions: z.string().nullable().optional(),
  body: assessmentBodyExport,
});

export type TemplateDoc = z.infer<typeof templateDocSchema>;

/** Validate a row's stored `body` before building an assessment out of it. A template
 *  edited into an invalid shape must fail at import, loudly, not produce a half-built
 *  funnel the tenant then has to debug. */
export function parseTemplateBody(body: unknown) {
  return assessmentBodyExport.safeParse(body);
}

/** Sort key that keeps the known categories in authored order and pushes anything
 *  else (a contributor's own wording) to the end alphabetically. */
export function categoryRank(category: string): number {
  const i = (TEMPLATE_CATEGORIES as readonly string[]).indexOf(category);
  return i === -1 ? TEMPLATE_CATEGORIES.length : i;
}

/**
 * Strip `"disqualifies": false` from gate options.
 *
 * The builder shows a TICK, and the tick writes a plain boolean - there is no third
 * state, and none is planned. So in a document, `"disqualifies": false` is the verbose
 * way of writing "unticked", and it is on roughly four lines out of every five in the
 * gate. That bulk hides the one line that is actually doing something, and it invites
 * the reasonable-but-wrong conclusion that the builder is missing a control the format
 * supports.
 *
 * Lossless, and that is checkable rather than hoped for: `qualOptionSchema` declares
 * `disqualifies: z.boolean().default(false)`, and EVERY consumer of the stored blob
 * parses it through `qualificationSchema` first - the public funnel (app/a/[slug]),
 * both builders, and the scorer in actions/submission.ts. An absent key comes back as
 * false in all four.
 *
 * `points` is deliberately left alone, including `0`. It is a number an owner tunes,
 * and a scale with its zeroes removed reads as though some answers are unscored.
 *
 * Pure and non-mutating: the caller's object is never touched.
 */
export function tidyGateDefaults<T>(body: T): T {
  const clone = JSON.parse(JSON.stringify(body)) as {
    qualification?: { questions?: Array<{ options?: Array<Record<string, unknown>> }> } | null;
  };
  for (const q of clone.qualification?.questions ?? []) {
    for (const o of q.options ?? []) {
      if (o.disqualifies === false) delete o.disqualifies;
    }
  }
  return clone as T;
}

/**
 * The funnel as the public page sees it.
 *
 * This repeats the query from src/features/assessment/data.ts rather than calling it,
 * because that module wraps the read in Next's unstable_cache and cannot run outside a
 * request. The SHAPE is what matters and it is pinned here: categories in displayOrder,
 * questions in displayOrder, options in displayOrder with their routes, bands in
 * displayOrder. If the app's include ever changes, a case that depends on the change
 * fails loudly rather than the harness quietly testing a different funnel.
 *
 * Also reads what the gate is made of, parsed with the app's OWN zod schemas, so the
 * harness can never disagree with the app about what a gate says.
 */
import { db } from "../db.js";
import {
  qualificationSchema,
  audienceGateSchema,
  readExits,
  isQualificationActive,
  EMPTY_QUALIFICATION,
  EMPTY_AUDIENCE_GATE,
  type QualificationInput,
  type AudienceGateInput,
  type GateExitInput,
} from "../../../src/features/assessment/schemas.js";
import type { EntryInput } from "../../../src/features/assessment/flow/entry.js";

export async function readFunnelRow(slug: string) {
  return db().assessment.findFirst({
    where: {
      slug,
      status: "PUBLISHED",
      OR: [{ tenantId: null }, { tenant: { deletedAt: null } }],
    },
    include: {
      categories: {
        orderBy: { displayOrder: "asc" },
        include: {
          questions: {
            orderBy: { displayOrder: "asc" },
            include: { options: { orderBy: { displayOrder: "asc" }, include: { route: true } } },
          },
        },
      },
      resultBands: { orderBy: { displayOrder: "asc" } },
    },
  });
}

export type FunnelRow = NonNullable<Awaited<ReturnType<typeof readFunnelRow>>>;

export interface Funnel {
  row: FunnelRow;
  /** Parsed gate, or the empty gate when the funnel has none. */
  qualification: QualificationInput;
  gateActive: boolean;
  /** Parsed audience gate (the "which best describes you" screen). */
  audience: AudienceGateInput;
  audienceActive: boolean;
  /** The app's own entry input, so firstStep/afterGateStep decide the opening screen
   *  here exactly as they do in the runner. */
  entry: EntryInput;
  /** The exit routes a disqualifying answer or a below-band score can land on. */
  exits: GateExitInput[];
  /** True when the opt-in form comes AFTER the questions. */
  optinAfter: boolean;
  /** True when conditional routing can fire: SINGLE mode with at least one route. */
  routingActive: boolean;
}

export async function readFunnel(slug: string): Promise<Funnel> {
  const row = await readFunnelRow(slug);
  if (!row) {
    throw new Error(
      `No PUBLISHED assessment with slug "${slug}" on this database. A draft is not reachable publicly, so there is nothing to drive.`,
    );
  }

  const qualParsed = qualificationSchema.safeParse(row.qualification);
  const qualification = qualParsed.success ? qualParsed.data : EMPTY_QUALIFICATION;
  const audParsed = audienceGateSchema.safeParse(row.audienceGate);
  const audience = audParsed.success ? audParsed.data : EMPTY_AUDIENCE_GATE;

  const audienceActive = audience.mode === "FREETEXT" || audience.roles.length > 0;
  const scoredQuestions = row.categories.reduce((n, c) => n + c.questions.length, 0);

  const hasRoute = row.categories.some((c) =>
    c.questions.some((q) => q.options.some((o) => o.route !== null)),
  );

  return {
    row,
    entry: {
      qualificationEnabled: qualification.enabled,
      qualificationQuestions: qualification.questions.length,
      audienceGate: audienceActive,
      scoredQuestions,
      leadCaptureAfter: row.leadCaptureAfter,
    },
    qualification,
    gateActive: isQualificationActive(row.qualification),
    audience,
    // "Renders at all" is the app's own definition in flow/entry.ts: free text always
    // renders, a dropdown needs at least one option.
    audienceActive,
    exits: readExits(row.disqualifiedContent),
    optinAfter: row.leadCaptureAfter,
    // Routing only fires in SINGLE mode: the other display modes put several questions
    // on one screen, where "jump to question 7" has no meaning.
    routingActive: row.questionDisplayMode === "SINGLE" && hasRoute,
  };
}

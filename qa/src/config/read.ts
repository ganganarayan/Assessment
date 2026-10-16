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
import { db, withDbRetry } from "../db.js";
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
import {
  buildSpine,
  defaultRouteOf,
  hasRouting,
  type RouteSpec,
  type SpineQuestion,
} from "../../../src/lib/routing/engine.js";

export async function readFunnelRow(slug: string) {
  return withDbRetry(
    () =>
      db().assessment.findFirst({
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
      }),
    "reading the funnel",
  );
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
  /** How the lead is asked for. ALL_AT_ONCE is the only shape the oracle models. */
  leadCaptureMode: "ALL_AT_ONCE" | "SPLIT";
  /** SPLIT, and usable (an email is collected). The case generator REFUSES these -
   *  every expectation downstream assumes one opt-in screen. */
  splitLeadCapture: boolean;
  /** True when conditional routing can fire. The app's own test: SINGLE mode and at
   *  least one rule anywhere, an option's or a question's DEFAULT route. */
  routingActive: boolean;
  /**
   * The traversal spine and the option rules, built ONCE and shared.
   *
   * They used to be rebuilt separately by the case generator and by the oracle, and
   * when questions gained a default route - the rule that brings a branch back - both
   * copies would have had to learn about it independently. A spine missing that is a
   * spine that quietly walks a different funnel from the one the respondent sees.
   */
  spine: SpineQuestion[];
  byOption: Map<string, RouteSpec>;
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

  // The spine carries each question's default route, because that is half of branching:
  // an option rule can fan a survey out but only a default route brings it back.
  const spine = buildSpine(
    row.categories.map((c) => ({
      id: c.id,
      page: c.page,
      questions: c.questions.map((q) => ({ id: q.id, defaultRoute: defaultRouteOf(q) })),
    })),
  );
  const byOption = new Map<string, RouteSpec>();
  for (const c of row.categories) {
    for (const q of c.questions) {
      for (const o of q.options) {
        if (o.route) {
          byOption.set(o.id, {
            action: o.route.action,
            targetQuestionId: o.route.targetQuestionId,
            targetCategoryId: o.route.targetCategoryId,
          });
        }
      }
    }
  }

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
    // SPLIT asks for the lead across three screens in a different order (name, gate,
    // email, assessment, phone). The oracle below is written entirely around the
    // single-screen model, so this flag exists to REFUSE those funnels rather than to
    // branch on them - see generateCases.
    leadCaptureMode: row.leadCaptureMode,
    splitLeadCapture: row.leadCaptureMode === "SPLIT" && row.collectEmail,
    // Routing only fires in SINGLE mode: the other display modes put several questions
    // on one screen, where "jump to question 7" has no meaning. The second half is the
    // app's own hasRouting, so an option rule and a default route both count.
    routingActive: row.questionDisplayMode === "SINGLE" && hasRouting(spine, byOption),
    spine,
    byOption,
  };
}

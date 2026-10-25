/**
 * Funnels built to be tested.
 *
 * The generated sweep can only cover what a funnel actually has, so a funnel nobody
 * built with a CONTINUE route has no CONTINUE case. These fixtures exist so the hard
 * shapes are always present somewhere on staging: three kinds of exit route, a gate
 * with bands, conditional routing with all three jump actions, an audience gate that
 * hands off to another assessment, and the opt-in on both sides of the questions.
 *
 * They are PLATFORM-scoped on purpose. A separate tenant would drag the billing gates
 * into every fixture - response caps, trial state, plan entitlements - none of which is
 * what these are for, and all of which would make a fixture fail for reasons that have
 * nothing to do with the behaviour under test. Slugs are prefixed qa-fixture- so they
 * are obvious in the funnel list, and seeding is idempotent: run it as often as you like.
 *
 *   railway run npm run qa:seed          create or update them
 *   railway run npm run qa:seed -- --rm  remove them again
 */
import { db } from "../db.js";

const PREFIX = "qa-fixture-";

/** Deterministic ids, so a re-seed updates in place and routes keep pointing at the
 *  same questions rather than accumulating copies. */
const id = (...parts: string[]): string => `qafix-${parts.join("-")}`.slice(0, 60);

interface OptionSpec {
  key: string;
  label: string;
  value: number;
  route?: { action: "JUMP_TO_QUESTION" | "JUMP_TO_CATEGORY" | "SKIP_TO_END" | "NEXT"; target?: string };
}
interface QuestionSpec {
  key: string;
  text: string;
  required?: boolean;
  weight?: number;
  /** FREE_TEXT: a sentence rather than a pick. Scores nothing and carries no option,
   *  so the flow leaves it by the question's default route. */
  typed?: boolean;
  /** Where the flow goes when NO option rule fires - a skipped question, a typed one,
   *  or an answer with no rule of its own. This is what brings a branch back. */
  defaultRoute?: {
    action: "JUMP_TO_QUESTION" | "JUMP_TO_CATEGORY" | "SKIP_TO_END" | "NEXT";
    target?: string;
  };
  options: OptionSpec[];
}
interface CategorySpec {
  key: string;
  name: string;
  page?: number;
  questions: QuestionSpec[];
}
interface BandSpec {
  level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  title: string;
  min: number;
  max: number;
}
interface FixtureSpec {
  slug: string;
  title: string;
  optinAfter: boolean;
  displayMode: "ALL" | "CATEGORY" | "SINGLE";
  retake: "UNLIMITED" | "DELAYED" | "NEVER";
  nextStep: "RESULTS" | "DESTINATION";
  targetUrl?: string;
  qualification?: unknown;
  disqualifiedContent?: unknown;
  audienceGate?: unknown;
  categories: CategorySpec[];
  bands: BandSpec[];
}

/* ---------- the fixtures -------------------------------------------------------- */

function scoredCategories(prefix: string): CategorySpec[] {
  return [
    {
      key: "c1",
      name: "How it works today",
      questions: [
        {
          key: "q1",
          text: "How often does this go wrong?",
          required: true,
          options: [
            { key: "a", label: "Every week", value: 1 },
            { key: "b", label: "Now and then", value: 3 },
            { key: "c", label: "Almost never", value: 5 },
          ],
        },
        {
          key: "q2",
          text: "Who notices first?",
          required: true,
          options: [
            { key: "a", label: "The customer", value: 1 },
            { key: "b", label: "Somebody internally", value: 3 },
            { key: "c", label: "A dashboard", value: 5 },
          ],
        },
        {
          key: "q3",
          text: "What happens next?",
          required: false,
          options: [
            { key: "a", label: "Nothing", value: 1 },
            { key: "b", label: "Somebody firefights", value: 3 },
            { key: "c", label: "It is fixed properly", value: 5 },
          ],
        },
      ],
    },
  ].map((c) => ({ ...c, key: `${prefix}${c.key}` }));
}

const GATE_EXITS = [
  {
    key: "out",
    name: "Wrong fit",
    mode: "PAGE",
    heading: "This one is not built for you.",
    subtext: "And that is the point.",
    bodyHtml: "<p>No lead stored, nothing in anyone's CRM.</p>",
    buttonLabel: "Read this instead",
    buttonUrl: "https://example.com/not-for-you",
    fireDisqualifiedEvent: true,
    eventName: "",
    contentCategory: "wrong_fit",
    completionEventName: "",
  },
  {
    key: "thanks",
    name: "Soft no",
    mode: "OPTIN",
    heading: "Thanks, we will be in touch.",
    subtext: "We took your details, and that is all.",
    bodyHtml: "",
    buttonLabel: "",
    buttonUrl: "",
    fireDisqualifiedEvent: true,
    eventName: "SoftNo",
    contentCategory: "not_yet",
    completionEventName: "",
  },
  {
    key: "waitlist",
    name: "Waitlist",
    mode: "CONTINUE",
    heading: "You are on the waitlist.",
    subtext: "Finish the assessment while you are here.",
    bodyHtml: "",
    buttonLabel: "",
    buttonUrl: "",
    fireDisqualifiedEvent: true,
    eventName: "WaitlistJoined",
    contentCategory: "waitlist",
    completionEventName: "WaitlistCompletion",
  },
];

const FIXTURES: FixtureSpec[] = [
  {
    slug: `${PREFIX}gate`,
    title: "QA fixture: a gate with three ways out",
    optinAfter: true,
    displayMode: "ALL",
    retake: "DELAYED",
    nextStep: "RESULTS",
    categories: scoredCategories("g-"),
    bands: [
      { level: "LOW", title: "Low", min: 0, max: 40 },
      { level: "MEDIUM", title: "Middling", min: 41, max: 59 },
      { level: "HIGH", title: "Strong", min: 60, max: 75 },
      { level: "CRITICAL", title: "Ready", min: 76, max: 100 },
    ],
    qualification: {
      enabled: true,
      showResultOfGate: false,
      bands: { enabled: true, passMin: 14, reviewMin: 8, belowExitKey: "out" },
      questions: [
        {
          id: "gq1",
          text: "Which of these is closest to your situation?",
          type: "choice",
          required: true,
          placeholder: "",
          options: [
            { id: "gq1a", label: "I run this myself", points: 8, disqualifies: false, exitKey: "" },
            { id: "gq1b", label: "I run it for clients", points: 6, disqualifies: false, exitKey: "" },
            { id: "gq1c", label: "I am not doing this yet", points: 0, disqualifies: true, exitKey: "out" },
            { id: "gq1d", label: "I am asking on somebody else's behalf", points: 2, disqualifies: false, exitKey: "" },
          ],
        },
        {
          id: "gq2",
          text: "When would you want this fixed?",
          type: "choice",
          required: true,
          placeholder: "",
          options: [
            { id: "gq2a", label: "This month", points: 8, disqualifies: false, exitKey: "" },
            { id: "gq2b", label: "Sometime this year", points: 4, disqualifies: false, exitKey: "" },
            { id: "gq2c", label: "Just looking", points: 0, disqualifies: true, exitKey: "thanks" },
            { id: "gq2d", label: "No timeline yet", points: 1, disqualifies: false, exitKey: "" },
          ],
        },
        {
          id: "gq3",
          text: "Can you start in the next two weeks?",
          type: "choice",
          required: true,
          placeholder: "",
          options: [
            { id: "gq3a", label: "Yes", points: 6, disqualifies: false, exitKey: "" },
            { id: "gq3b", label: "No, but keep me posted", points: 2, disqualifies: true, exitKey: "waitlist" },
            { id: "gq3c", label: "Not for a while", points: 1, disqualifies: false, exitKey: "" },
          ],
        },
        {
          id: "gq4",
          text: "Anything we should know?",
          type: "text",
          required: false,
          placeholder: "Optional",
          options: [],
        },
      ],
    },
    disqualifiedContent: {
      heading: GATE_EXITS[0]!.heading,
      subtext: GATE_EXITS[0]!.subtext,
      bodyHtml: GATE_EXITS[0]!.bodyHtml,
      buttonLabel: GATE_EXITS[0]!.buttonLabel,
      buttonUrl: GATE_EXITS[0]!.buttonUrl,
      fireDisqualifiedEvent: true,
      exits: GATE_EXITS,
    },
  },
  {
    slug: `${PREFIX}routing`,
    title: "QA fixture: answers that change the path",
    optinAfter: false,
    displayMode: "SINGLE",
    retake: "UNLIMITED",
    nextStep: "RESULTS",
    bands: [
      { level: "LOW", title: "Low", min: 0, max: 49 },
      { level: "HIGH", title: "High", min: 50, max: 100 },
    ],
    categories: [
      {
        key: "r-c1",
        name: "The first run of questions",
        questions: [
          {
            key: "r-q1",
            text: "Where should this go next?",
            required: true,
            options: [
              { key: "a", label: "Straight on", value: 3 },
              { key: "b", label: "Skip the next one", value: 3, route: { action: "JUMP_TO_QUESTION", target: "r-q3" } },
              { key: "c", label: "Jump to the second section", value: 3, route: { action: "JUMP_TO_CATEGORY", target: "r-c2" } },
              { key: "d", label: "End it here", value: 1, route: { action: "SKIP_TO_END" } },
            ],
          },
          {
            key: "r-q2",
            text: "The one that gets skipped",
            required: true,
            options: [
              { key: "a", label: "Seen it", value: 5 },
              { key: "b", label: "Also seen it", value: 1 },
            ],
          },
          {
            key: "r-q3",
            text: "The jump target",
            required: true,
            // Deliberately NO default route: it falls through to the typed question
            // below, which is the one that has to be reachable for the convergence
            // rule to be worth anything. The generator said so out loud the first time
            // this fixture put the jump here instead.
            options: [
              { key: "a", label: "Fine", value: 5 },
              { key: "b", label: "Not fine", value: 1 },
            ],
          },
          {
            key: "r-q-typed",
            text: "In your own words, what would make this worth doing?",
            required: true,
            typed: true,
            // A typed answer carries no rule at all, which is exactly the case the
            // default route exists for.
            defaultRoute: { action: "JUMP_TO_CATEGORY", target: "r-c2" },
            options: [],
          },
        ],
      },
      {
        key: "r-c2",
        // PAGE 2, so the spine's page-1-then-page-2 ordering is exercised by something
        // rather than assumed: the two scored pages are a shape real funnels use and
        // the runner groups its screens by it.
        page: 2,
        name: "The second run of questions",
        questions: [
          {
            key: "r-q4",
            text: "Last one",
            required: true,
            options: [
              { key: "a", label: "Good", value: 5 },
              { key: "b", label: "Bad", value: 1 },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: `${PREFIX}audience`,
    title: "QA fixture: which of these are you",
    optinAfter: true,
    displayMode: "CATEGORY",
    retake: "UNLIMITED",
    nextStep: "RESULTS",
    categories: scoredCategories("a-"),
    bands: [
      { level: "LOW", title: "Low", min: 0, max: 59 },
      { level: "HIGH", title: "High", min: 60, max: 100 },
    ],
  },
];

/* ---------- seeding ------------------------------------------------------------- */

async function removeFixtures(): Promise<void> {
  const rows = await db().assessment.findMany({ where: { slug: { startsWith: PREFIX } }, select: { id: true, slug: true } });
  for (const r of rows) {
    await db().assessment.delete({ where: { id: r.id } });
    console.log(`  removed ${r.slug}`);
  }
  if (rows.length === 0) console.log("  nothing to remove");
}

async function seedOne(spec: FixtureSpec): Promise<string> {
  const assessmentId = id(spec.slug);

  // Replace the content wholesale: deleting the categories cascades to questions,
  // options and routes, which keeps a re-seed from accumulating stale copies.
  await db().assessment.deleteMany({ where: { id: assessmentId } });

  await db().assessment.create({
    data: {
      id: assessmentId,
      slug: spec.slug,
      title: spec.title,
      subheadline: "A fixture for the verification harness. Safe to take as often as you like.",
      status: "PUBLISHED",
      publishedAt: new Date(),
      tenantId: null,
      questionDisplayMode: spec.displayMode,
      leadCaptureAfter: spec.optinAfter,
      retakePolicy: spec.retake,
      retakeDays: 15,
      uniqueIdentifier: "EMAIL",
      nextStep: spec.nextStep,
      targetUrl: spec.targetUrl ?? null,
      // No anticipation countdown: it exists to build tension for a real respondent and
      // only costs the sweep ten seconds a case.
      vslCountdownSeconds: 0,
      collectFirstName: true,
      firstNameRequired: true,
      collectEmail: true,
      emailRequired: true,
      collectMobile: true,
      mobileRequired: false,
      // Off deliberately: the field defaults to ON and REQUIRED, and with no profession
      // options configured it renders a required dropdown with nothing in it, which
      // cannot be submitted and says nothing about why. Not what these fixtures test.
      collectProfession: false,
      professionRequired: false,
      fireMetaCapi: true,
      useAiStatement: false,
      paidMode: false,
      platformSignup: false,
      ...(spec.qualification ? { qualification: spec.qualification as object } : {}),
      ...(spec.disqualifiedContent ? { disqualifiedContent: spec.disqualifiedContent as object } : {}),
      ...(spec.audienceGate ? { audienceGate: spec.audienceGate as object } : {}),
      resultBands: {
        create: spec.bands.map((b, i) => ({
          id: id(spec.slug, "band", String(i)),
          level: b.level,
          title: b.title,
          description: `Fixture band ${b.title}`,
          minScore: b.min,
          maxScore: b.max,
          displayOrder: i,
        })),
      },
      categories: {
        create: spec.categories.map((c, ci) => ({
          id: id(spec.slug, c.key),
          name: c.name,
          page: c.page ?? 1,
          displayOrder: ci,
          questions: {
            create: c.questions.map((q, qi) => ({
              id: id(spec.slug, q.key),
              text: q.text,
              type: (q.typed ? "FREE_TEXT" : "SINGLE_SELECT") as "FREE_TEXT" | "SINGLE_SELECT",
              // The default route: where the flow goes when no option rule fires, which
              // for a typed question is always, because there is no option to hang a
              // rule on. Forward-only, same as every other target.
              defaultRouteAction: q.defaultRoute?.action ?? null,
              defaultTargetQuestionId:
                q.defaultRoute?.action === "JUMP_TO_QUESTION" && q.defaultRoute.target
                  ? id(spec.slug, q.defaultRoute.target)
                  : null,
              defaultTargetCategoryId:
                q.defaultRoute?.action === "JUMP_TO_CATEGORY" && q.defaultRoute.target
                  ? id(spec.slug, q.defaultRoute.target)
                  : null,
              weight: q.weight ?? 1,
              required: q.required ?? true,
              displayOrder: qi,
              options: {
                create: q.options.map((o, oi) => ({
                  id: id(spec.slug, q.key, o.key),
                  label: o.label,
                  value: o.value,
                  displayOrder: oi,
                })),
              },
            })),
          },
        })),
      },
    },
  });

  // Routes second: a route points at a question or category that has to exist first.
  for (const c of spec.categories) {
    for (const q of c.questions) {
      for (const o of q.options) {
        if (!o.route) continue;
        await db().questionRoute.create({
          data: {
            id: id(spec.slug, q.key, o.key, "route"),
            action: o.route.action,
            questionId: id(spec.slug, q.key),
            optionId: id(spec.slug, q.key, o.key),
            targetQuestionId: o.route.action === "JUMP_TO_QUESTION" && o.route.target ? id(spec.slug, o.route.target) : null,
            targetCategoryId: o.route.action === "JUMP_TO_CATEGORY" && o.route.target ? id(spec.slug, o.route.target) : null,
          },
        });
      }
    }
  }

  return assessmentId;
}

export async function seedFixtures(remove: boolean): Promise<void> {
  if (remove) {
    console.log("Removing the QA fixtures:");
    await removeFixtures();
    return;
  }

  console.log("Seeding the QA fixtures:");
  const ids = new Map<string, string>();
  for (const spec of FIXTURES) {
    const createdId = await seedOne(spec);
    ids.set(spec.slug, createdId);
    console.log(`  ${spec.slug}`);
  }

  // The audience fixture hands one role to the gate fixture, which is the behaviour
  // worth testing: a role that sends the respondent to a different assessment. It is
  // written after both exist, because the target is an assessment id.
  const gateId = ids.get(`${PREFIX}gate`);
  if (gateId) {
    await db().assessment.update({
      where: { slug: `${PREFIX}audience` },
      data: {
        audienceGate: {
          mode: "DROPDOWN",
          label: "Which of these are you?",
          placeholder: "Select…",
          freeTextRequired: false,
          listId: "",
          roles: [
            { id: "role-stay", label: "I am the right person", target: "" },
            { id: "role-also-stay", label: "I am involved, not deciding", target: "" },
            { id: "role-handoff", label: "None of these", target: gateId },
          ],
        },
      },
    });
    console.log(`  ${PREFIX}audience hands "None of these" to ${PREFIX}gate`);
  }

  console.log("\nSweep them with:");
  for (const spec of FIXTURES) console.log(`  railway run npm run qa -- --slug=${spec.slug}`);
}

/**
 * Validate the built-in Template documents without touching a database.
 *
 * A template is CONTENT, and content is the one thing a typecheck cannot check. The
 * documents are typed `unknown` at the import boundary on purpose (zod is the gate),
 * so without this script a mistyped level, an overlapping band range or a gate option
 * missing its id would reach staging and only announce itself the first time a tenant
 * pressed Import.
 *
 * It also enforces the things zod cannot express:
 *  - the shape a document CLAIMS matches the funnel it actually describes
 *  - result bands cover 0-100 with no gap and no overlap
 *  - a gate question has at least one disqualifying answer, or it is not a gate
 *  - no two documents share a template slug or an assessment slug
 *  - something on the shelf carries both result pages, so the import's choice is real
 *
 *   npx tsx scripts/verify-templates.ts
 */
import { templateDocSchema, TEMPLATE_CATEGORIES } from "../src/features/templates/schema";
import { qualificationSchema } from "../src/features/assessment/schemas";
import { BUILTIN_TEMPLATE_DOCS } from "../src/features/templates/builtin";
import { buildSpine, walk, type RouteSpec, type SpineQuestion } from "../src/lib/routing/engine";
import type { TemplateDoc } from "../src/features/templates/schema";
import { INDUSTRY_CATEGORIES } from "../src/features/onboarding/steps";

/**
 * Branching checks for a template that routes - run against the pure engine, with the
 * document's own keys standing in for the ids an import will create.
 *
 * Three things are proved, and the third is the one that matters:
 *  1. every target key resolves to something in this document,
 *  2. every jump is strictly forward (the import refuses a backward one, so a template
 *     carrying one would fail the moment a tenant pressed Import),
 *  3. a respondent who picks one branch NEVER sees another branch's questions, and
 *     still reaches the shared tail.
 *
 * Point 3 cannot be eyeballed. A ten-branch survey has ten paths and the failure is
 * silent: every question is present, in the right order, and a tenth of the respondents
 * answer somebody else's follow-ups.
 */
function routingProblems(d: TemplateDoc): string[] {
  const out: string[] = [];
  const cats = d.body.categories;
  const keyOfCat = (ci: number) => cats[ci]!.key ?? `c${ci + 1}`;
  const keyOfQ = (ci: number, qi: number) => cats[ci]!.questions[qi]!.key ?? `c${ci + 1}q${qi + 1}`;

  const anyRoute = cats.some((c) =>
    c.questions.some((q) => q.defaultRoute != null || q.options.some((o) => o.route != null)),
  );
  if (!anyRoute) return out;

  // SINGLE is the only mode that honors routing, so a routed template in another mode
  // is a template whose branches silently do nothing.
  if (d.body.questionDisplayMode !== "SINGLE") {
    out.push(
      `routes but questionDisplayMode is ${d.body.questionDisplayMode ?? "unset"}, so they never fire`,
    );
  }

  const catKeys = new Set(cats.map((_, ci) => keyOfCat(ci)));
  const qKeys = new Set(cats.flatMap((c, ci) => c.questions.map((_, qi) => keyOfQ(ci, qi))));

  // The spine, ordered exactly as the import will order the rows it creates.
  const spine: SpineQuestion[] = buildSpine(
    cats.map((c, ci) => ({
      id: keyOfCat(ci),
      page: c.page ?? 1,
      questions: c.questions.map((q, qi) => ({
        id: keyOfQ(ci, qi),
        defaultRoute: q.defaultRoute
          ? {
              action: q.defaultRoute.action,
              targetQuestionId: q.defaultRoute.targetQuestionKey ?? null,
              targetCategoryId: q.defaultRoute.targetCategoryKey ?? null,
            }
          : null,
      })),
    })),
  );
  const indexOfQ = new Map(spine.map((sq, i) => [sq.id, i] as const));
  const firstIndexOfCat = new Map<string, number>();
  spine.forEach((sq, i) => {
    if (!firstIndexOfCat.has(sq.categoryId)) firstIndexOfCat.set(sq.categoryId, i);
  });
  const catOfQ = new Map(spine.map((sq) => [sq.id, sq.categoryId] as const));

  const optionId = (qKey: string, oi: number) => `${qKey}#${oi}`;
  const byOption = new Map<string, RouteSpec>();
  cats.forEach((c, ci) =>
    c.questions.forEach((q, qi) =>
      q.options.forEach((o, oi) => {
        if (!o.route) return;
        byOption.set(optionId(keyOfQ(ci, qi), oi), {
          action: o.route.action,
          targetQuestionId: o.route.targetQuestionKey ?? null,
          targetCategoryId: o.route.targetCategoryKey ?? null,
        });
      }),
    ),
  );

  /** The target resolves, and is strictly forward of `from`. */
  const checkRule = (
    rule: { action: string; targetQuestionKey?: string | null; targetCategoryKey?: string | null },
    from: number,
    where: string,
  ) => {
    if (rule.action === "JUMP_TO_QUESTION") {
      const k = rule.targetQuestionKey ?? "";
      if (!qKeys.has(k)) {
        out.push(`${where}: no question with key "${k}"`);
        return;
      }
      if (indexOfQ.get(k)! <= from) out.push(`${where}: "${k}" is not a later question`);
      return;
    }
    if (rule.action === "JUMP_TO_CATEGORY") {
      const k = rule.targetCategoryKey ?? "";
      if (!catKeys.has(k)) {
        out.push(`${where}: no category with key "${k}"`);
        return;
      }
      const ci = firstIndexOfCat.get(k);
      if (ci === undefined || ci <= from) out.push(`${where}: "${k}" is not a later category`);
    }
  };

  cats.forEach((c, ci) =>
    c.questions.forEach((q, qi) => {
      const qk = keyOfQ(ci, qi);
      const from = indexOfQ.get(qk)!;
      q.options.forEach((o) => {
        if (o.route) checkRule(o.route, from, `"${o.label.slice(0, 24)}" on ${qk}`);
      });
      if (q.defaultRoute) checkRule(q.defaultRoute, from, `default route on ${qk}`);
    }),
  );

  // ---- No branch leaks into a sibling branch, and all of them rejoin -------
  const lastCat = keyOfCat(cats.length - 1);
  cats.forEach((c, ci) =>
    c.questions.forEach((q, qi) => {
      const qk = keyOfQ(ci, qi);
      const siblings = new Set(
        q.options
          .filter((o) => o.route?.action === "JUMP_TO_CATEGORY" && o.route.targetCategoryKey)
          .map((o) => o.route!.targetCategoryKey as string),
      );
      if (siblings.size < 2) return;

      q.options.forEach((o, oi) => {
        const target = o.route?.action === "JUMP_TO_CATEGORY" ? o.route.targetCategoryKey : null;
        if (!target) return;
        // Answer THIS option and nothing else: the respondent who skips every optional
        // follow-up, which is the path that used to fall through into the next branch.
        const reached = walk(new Map([[qk, optionId(qk, oi)]]), spine, byOption).reached;
        const strayed = [
          ...new Set(
            reached.map((id) => catOfQ.get(id)!).filter((cat) => cat !== target && siblings.has(cat)),
          ),
        ];
        if (strayed.length > 0) {
          out.push(
            `"${o.label.slice(0, 24)}" routes to ${target} but the path also enters ${strayed.join(", ")}`,
          );
        }
        if (!reached.some((id) => catOfQ.get(id) === lastCat)) {
          out.push(`"${o.label.slice(0, 24)}" routes to ${target} and never reaches ${lastCat}`);
        }
      });
    }),
  );

  return out;
}

let failures = 0;
const ok = (name: string) => console.log(`  PASS  ${name}`);
const fail = (name: string, detail: string) => {
  failures += 1;
  console.log(`  FAIL  ${name}\n        ${detail}`);
};

interface Band {
  minScore: number;
  maxScore: number;
}

/** Bands must tile 0..100: sorted, starting at 0, ending at 100, each one starting
 *  exactly where the last ended plus one. A gap silently drops a respondent into the
 *  "nearest band" fallback, which is a guess presented as a verdict. */
function bandCoverage(bands: Band[]): string | null {
  if (bands.length === 0) return null;
  const sorted = [...bands].sort((a, b) => a.minScore - b.minScore);
  if (sorted[0]!.minScore !== 0) return `first band starts at ${sorted[0]!.minScore}, not 0`;
  if (sorted[sorted.length - 1]!.maxScore !== 100) {
    return `last band ends at ${sorted[sorted.length - 1]!.maxScore}, not 100`;
  }
  for (let i = 1; i < sorted.length; i += 1) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (cur.minScore !== prev.maxScore + 1) {
      return `${prev.maxScore} -> ${cur.minScore} is a ${cur.minScore > prev.maxScore + 1 ? "gap" : "overlap"}`;
    }
  }
  return null;
}

const templateSlugs = new Set<string>();
const assessmentSlugs = new Set<string>();

for (const raw of BUILTIN_TEMPLATE_DOCS) {
  const parsed = templateDocSchema.safeParse(raw);
  const named = (raw as { slug?: string })?.slug ?? "(unnamed)";
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    fail(named, `${i?.message ?? "invalid"}${i?.path?.length ? ` at ${i.path.join(".")}` : ""}`);
    continue;
  }
  const d = parsed.data;
  const b = d.body;
  const problems: string[] = [];

  if (templateSlugs.has(d.slug)) problems.push("duplicate template slug");
  templateSlugs.add(d.slug);
  if (assessmentSlugs.has(b.slug)) problems.push(`duplicate assessment slug "${b.slug}"`);
  assessmentSlugs.add(b.slug);

  if (!(TEMPLATE_CATEGORIES as readonly string[]).includes(d.category)) {
    problems.push(`category "${d.category}" is not one of the known buckets`);
  }

  const gateQuestions = (b.qualification as { questions?: unknown[] } | null)?.questions ?? [];
  const gateOn = (b.qualification as { enabled?: boolean } | null)?.enabled === true;
  const questions = b.categories.reduce((n, c) => n + c.questions.length, 0);

  // The shape a document claims is what the library SAYS it is. A claim that does not
  // match the funnel is worse than no claim: the tenant picks "screening only" and
  // imports something that scores.
  const gated = gateOn && gateQuestions.length > 0;
  if (d.shape === "GATE_ONLY" && (!gated || questions > 0)) {
    problems.push(`claims GATE_ONLY but has gate=${gated ? gateQuestions.length : 0}, questions=${questions}`);
  }
  if (d.shape === "GATED_ASSESSMENT" && (!gated || questions === 0)) {
    problems.push(`claims GATED_ASSESSMENT but has gate=${gated ? gateQuestions.length : 0}, questions=${questions}`);
  }
  if (d.shape === "UNGATED_ASSESSMENT" && (gated || questions === 0)) {
    problems.push(`claims UNGATED_ASSESSMENT but has gate=${gated ? gateQuestions.length : 0}, questions=${questions}`);
  }

  // A gate with nothing that disqualifies is a questionnaire wearing a gate's name.
  //
  // The rule is per GATE, not per question. A gate question is allowed to disqualify
  // nobody and only carry points: the gate scores the people who pass as well as
  // turning away the ones who do not (see qualOptionSchema). Checking each question
  // individually called three perfectly good scoring questions a defect.
  for (const gqRaw of gateQuestions) {
    const gq = gqRaw as { id?: string; type?: string; options?: Array<{ id?: string; disqualifies?: boolean }> };
    if (gq.type !== "choice") continue;
    for (const o of gq.options ?? []) if (!o.id) problems.push(`a gate option on "${gq.id}" has no id`);
  }
  if (gated && !gateQuestions.some((gqRaw) => (gqRaw as { options?: Array<{ disqualifies?: boolean }> }).options?.some((o) => o.disqualifies))) {
    problems.push("gate is enabled but nothing in it can disqualify");
  }

  const cov = bandCoverage(b.resultBands);
  if (cov) problems.push(`result bands: ${cov}`);
  for (const c of b.categories) {
    const cc = bandCoverage(c.bands ?? []);
    if (cc) problems.push(`category "${c.name}" bands: ${cc}`);
    for (const qq of c.questions) {
      // A FREE_TEXT question has no options by definition, and an UNSCORED question
      // (every option worth zero, as in a survey that only collects answers) has no
      // points to duplicate. Both rules below are about a SCORED choice question - the
      // case where two options worth the same number means somebody fat-fingered a
      // scale - so neither applies to those.
      const typed = qq.type === "FREE_TEXT";
      const scored = qq.options.some((o) => o.value !== 0);
      if (!typed && qq.options.length < 2) {
        problems.push(`question "${qq.text.slice(0, 30)}" has under 2 options`);
      }
      const values = qq.options.map((o) => o.value);
      if (!typed && scored && new Set(values).size !== values.length) {
        problems.push(`question "${qq.text.slice(0, 30)}" repeats an option value`);
      }
    }
  }

  // An AI statement with no instructions generates from whatever the workspace default
  // happens to be, which for a customer tenant resolves to nothing at all.
  if (b.useAiStatement && !d.aiInstructions?.trim()) {
    problems.push("useAiStatement is on but the template suggests no instructions");
  }
  if (!b.useAiStatement && d.aiInstructions?.trim()) {
    problems.push("carries instructions but useAiStatement is off");
  }
  // A gate-only funnel has no categories to interpret, so an AI statement has nothing
  // to write about.
  if (d.shape === "GATE_ONLY" && b.useAiStatement) problems.push("GATE_ONLY with an AI statement");

  problems.push(...routingProblems(d));

  /**
   * The RESULT PAGES this template brings, reported per row.
   *
   * The transfer shape carries them and the importer creates them, so this is part of
   * what a template IS - and it is the fact to check before publishing one, because a
   * template with neither hands a workspace a funnel that ends on the built-in score
   * cards. Not a failure: a scorecard with no page is a legitimate starting point.
   */
  const pages = [
    Array.isArray(b.publishedPages) && b.publishedPages.length > 0 ? "results" : null,
    b.resultPage != null || b.resultPagePublished != null ? "vsl" : null,
  ].filter(Boolean);

  if (problems.length) fail(d.slug, problems.join("\n        "));
  else
    ok(
      `${d.slug}  [${d.shape}] gate=${gateQuestions.length} questions=${questions} ai=${d.aiInstructions ? "yes" : "no"} pages=${pages.length ? pages.join("+") : "none"}`,
    );
}

// The set has to teach all three shapes and both AI variants, or the library shows a
// new tenant only one way to build a funnel.
const docs = BUILTIN_TEMPLATE_DOCS
  .map((r) => templateDocSchema.safeParse(r))
  .flatMap((p) => (p.success ? [p.data] : []));
for (const shape of ["GATE_ONLY", "GATED_ASSESSMENT", "UNGATED_ASSESSMENT"] as const) {
  if (docs.some((d) => d.shape === shape)) ok(`coverage: ${shape}`);
  else fail("coverage", `no built-in template has shape ${shape}`);
}
/**
 * At least one template has to carry BOTH result pages, or the choice the importer now
 * offers has nothing to choose between: the library asks which page to bring only when a
 * template carries both, so a shelf where none does means the question never appears and
 * every imported funnel ends on the built-in score cards.
 */
{
  const both = docs.filter(
    (d) =>
      Array.isArray(d.body.publishedPages) &&
      (d.body.publishedPages as unknown[]).length > 0 &&
      (d.body.resultPage != null || d.body.resultPagePublished != null),
  );
  if (both.length > 0) ok(`coverage: ${both.length} template(s) carry both result pages`);
  else fail("coverage", "no built-in carries both result pages, so the import never asks which one to bring");
}

/**
 * 🔴 NO BUILT-IN MAY SHIP A BUTTON THAT CANNOT DO ANYTHING.
 *
 * Both templates with a VSL page shipped "Book the 30 minutes" with an empty url and
 * bookingCta off, and the renderer turned that into href="#": the most important button
 * in the product, at the end of a funnel whose whole purpose is to produce that call,
 * linking to nothing on a page that looked finished. A template cannot know the booking
 * slug of the workspace importing it, so an empty url is legitimate - what is not is an
 * empty url with no booking action, because then the click has nowhere to go AND
 * nothing to record. The renderer now hides such a button; this stops one being written.
 */
{
  const offenders: string[] = [];
  for (const d of docs) {
    for (const key of ["resultPage", "resultPagePublished"] as const) {
      const page = d.body[key] as { blocks?: { type?: string; config?: Record<string, unknown> }[] } | null;
      for (const b of page?.blocks ?? []) {
        if (b?.type !== "button") continue;
        const url = typeof b.config?.url === "string" ? b.config.url.trim() : "";
        if (!url && b.config?.bookingCta !== true) {
          offenders.push(`${d.slug} (${key}): "${String(b.config?.label ?? "")}"`);
        }
      }
    }
  }
  if (offenders.length === 0) ok("result pages: every button has a destination or requests a booking");
  else fail("buttons", `these go nowhere and record nothing:\n        ${offenders.join("\n        ")}`);
}

if (docs.some((d) => d.aiInstructions)) ok("coverage: with an AI statement");
else fail("coverage", "no built-in template carries AI instructions");
if (docs.some((d) => !d.aiInstructions)) ok("coverage: without an AI statement");
else fail("coverage", "every built-in template needs AI, so none works without a provider");

// Omitting `disqualifies` is only safe because the gate schema defaults it to false
// and every consumer parses the stored blob through that schema. Prove it here rather
// than trust it: if that default were ever dropped, 92 answers across six templates
// would silently stop rejecting anybody, and the funnels would look like they worked.
{
  const withGate = docs.filter(
    (d) => ((d.body.qualification as { questions?: unknown[] } | null)?.questions?.length ?? 0) > 0,
  );
  let checked = 0;
  let bad = 0;
  for (const d of withGate) {
    const parsed = qualificationSchema.safeParse(d.body.qualification);
    if (!parsed.success) {
      fail(`${d.slug} gate`, "the gate does not parse through qualificationSchema");
      bad += 1;
      continue;
    }
    for (const q of parsed.data.questions) {
      for (const o of q.options) {
        checked += 1;
        if (typeof o.disqualifies !== "boolean") {
          fail(`${d.slug} gate`, `option "${o.id}" read back disqualifies=${String(o.disqualifies)}, not a boolean`);
          bad += 1;
        }
      }
    }
  }
  if (bad === 0) ok(`omitted defaults: ${checked} gate options all read back a real boolean`);
}

// The home page lists TEMPLATE_CATEGORIES as "who it is for" and says each audience has
// a ready-made scorecard behind it. That sentence is only true while every category
// actually has one, and the failure is silent: the page would simply advertise an
// audience the library cannot serve, with nothing erroring anywhere.
{
  const have = new Set(docs.map((d) => d.category));
  const empty = TEMPLATE_CATEGORIES.filter((c) => !have.has(c));
  if (empty.length === 0) {
    ok(`audiences: all ${TEMPLATE_CATEGORIES.length} categories have a built-in behind them`);
  } else {
    fail("audiences", `the home page lists these with no template behind them: ${empty.join(", ")}`);
  }
}

/**
 * The guided setup's industry question offers these same buckets, and the import step
 * matches a tenant's answer against a template's category by equality. So the two lists
 * have to BE the same list, minus the owner's own bucket.
 *
 * 🟡 WHY IT IS NOT ONE CONSTANT. The onboarding registry is client-safe and deliberately
 * light; importing the template schema into it to share this array would pull zod and
 * the whole assessment transfer schema into the browser bundle to save twenty-one
 * strings. So they are two lists and this is the seam that keeps them honest.
 *
 * Both directions matter. A category in the library and not in the question leaves the
 * tenants it describes picking "Something else" and asking us to build a template that
 * already exists. One in the question and not in the library offers somebody an industry
 * and then matches nothing, which is worse: it reads as the product being broken rather
 * than as the library being incomplete.
 */
{
  const offered = new Set<string>(INDUSTRY_CATEGORIES);
  // "Platform" is the owner's own funnels, which no tenant should pick as their trade.
  const library = TEMPLATE_CATEGORIES.filter((c) => c !== "Platform");

  const missing = library.filter((c) => !offered.has(c));
  if (missing.length === 0) {
    ok(`industries: all ${library.length} library categories are offered in the setup`);
  } else {
    fail("industries", `in the library but never offered: ${missing.join(", ")}`);
  }

  const unknown = INDUSTRY_CATEGORIES.filter(
    (c) => !(TEMPLATE_CATEGORIES as readonly string[]).includes(c),
  );
  if (unknown.length === 0) {
    ok("industries: every offered industry exists in the library");
  } else {
    fail("industries", `offered in the setup but not a library category: ${unknown.join(", ")}`);
  }
}

console.log(
  failures === 0
    ? `\nAll ${docs.length} built-in templates are valid.`
    : `\n${failures} problem(s) found.`,
);
process.exit(failures === 0 ? 0 : 1);

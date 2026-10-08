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
 *
 *   npx tsx scripts/verify-templates.ts
 */
import { templateDocSchema, TEMPLATE_CATEGORIES } from "../src/features/templates/schema";
import { qualificationSchema } from "../src/features/assessment/schemas";
import { BUILTIN_TEMPLATE_DOCS } from "../src/features/templates/builtin";

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
      if (qq.options.length < 2) problems.push(`question "${qq.text.slice(0, 30)}" has under 2 options`);
      const values = qq.options.map((o) => o.value);
      if (new Set(values).size !== values.length) {
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

  if (problems.length) fail(d.slug, problems.join("\n        "));
  else ok(`${d.slug}  [${d.shape}] gate=${gateQuestions.length} questions=${questions} ai=${d.aiInstructions ? "yes" : "no"}`);
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

console.log(
  failures === 0
    ? `\nAll ${docs.length} built-in templates are valid.`
    : `\n${failures} problem(s) found.`,
);
process.exit(failures === 0 ? 0 : 1);

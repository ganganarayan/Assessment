/**
 * Validate every built-in template against the schema the seeder uses, and say what
 * each one actually brings.
 *
 * The seeder is fail-soft by design: a malformed file reports itself and the others
 * still land. That is right at runtime and wrong as the only check, because the report
 * is a row in a console nobody is watching during a deploy - a template can be broken
 * for a week before anyone notices the shelf is one short. This runs in the build
 * instead, where a bad file stops the deploy that introduced it.
 *
 * It also prints the audit the Templates screen now shows per row - gate, scored, both
 * result pages, AI instructions - because that is the question asked before publishing
 * one, and answering it from the repo is faster than clicking twenty-two rows.
 *
 * Run: npm run verify:templates
 */
import { BUILTIN_TEMPLATE_DOCS } from "../src/features/templates/builtin";
import { templateDocSchema } from "../src/features/templates/schema";

let failures = 0;
const slugs = new Set<string>();

console.log("\nBuilt-in templates\n");

for (const raw of BUILTIN_TEMPLATE_DOCS) {
  const parsed = templateDocSchema.safeParse(raw);
  if (!parsed.success) {
    failures += 1;
    const slug = (raw as { slug?: unknown })?.slug;
    console.log(`  FAIL ${typeof slug === "string" ? slug : "(unnamed)"}`);
    for (const i of parsed.error.issues.slice(0, 5)) {
      console.log(`       ${i.path.join(".") || "(root)"}: ${i.message}`);
    }
    continue;
  }

  const doc = parsed.data;
  if (slugs.has(doc.slug)) {
    failures += 1;
    console.log(`  FAIL ${doc.slug} - a second file claims this slug, so one would overwrite the other`);
    continue;
  }
  slugs.add(doc.slug);

  const b = doc.body;
  const gate = b.qualification as { questions?: unknown[] } | null | undefined;
  const gateCount = Array.isArray(gate?.questions) ? gate.questions.length : 0;
  const scored = b.categories.reduce((n, c) => n + c.questions.length, 0);
  const results = Array.isArray(b.publishedPages) && b.publishedPages.length > 0;
  const vsl = b.resultPage != null || b.resultPagePublished != null;

  // The shape is a claim about the content, so it is worth checking against it: a
  // template that says "screen, then score" and carries no gate imports as a funnel
  // that screens nobody.
  if (doc.shape === "GATED_ASSESSMENT" && (gateCount === 0 || scored === 0)) {
    failures += 1;
    console.log(`  FAIL ${doc.slug} - says "screen, then score" but has ${gateCount} gate and ${scored} scored`);
    continue;
  }
  if (doc.shape === "GATE_ONLY" && scored > 0) {
    failures += 1;
    console.log(`  FAIL ${doc.slug} - says "screening only" but carries ${scored} scored questions`);
    continue;
  }
  if (doc.shape === "UNGATED_ASSESSMENT" && gateCount > 0) {
    failures += 1;
    console.log(`  FAIL ${doc.slug} - says "score everyone" but carries a gate of ${gateCount}`);
    continue;
  }

  const parts = [
    `${gateCount} gate`,
    `${scored} scored`,
    results ? "results page" : "no results page",
    vsl ? "VSL page" : "no VSL page",
    doc.aiInstructions?.trim() ? "AI instructions" : "no AI statement",
  ];
  console.log(`  ok   ${doc.slug.padEnd(32)} ${parts.join(" · ")}`);
}

console.log(
  failures === 0
    ? `\n🟢 ${slugs.size} templates, all readable by the importer.\n`
    : `\n🔴 ${failures} template${failures === 1 ? "" : "s"} would not import.\n`,
);
process.exit(failures === 0 ? 0 : 1);

/**
 * AI personalized-statement verification (no DB, no network). Covers the secret
 * encryption round-trip, the pure prompt builder (overall + per-category scores
 * AND the per-question detail that drives "meaning"; word target + training-video
 * close present), and the per-question breakdown builder.
 *
 *   npx tsx scripts/verify-ai.ts
 */
import { encryptWithSecret, decryptWithSecret, isEncrypted } from "../src/lib/crypto";
import { buildStatementMessages, humanizeStatement } from "../src/lib/ai/prompt";
import { PROMPT_VERSIONS } from "../src/lib/ai/prompt-versions";
import { buildCategoryQuestionBreakdown } from "../src/lib/result/questions";
import { DEFAULT_MODEL, isAiProvider } from "../src/lib/ai/types";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("AI feature verification\n");

// (a) Secret encryption round-trip.
{
  const secret = "a-test-better-auth-secret-32chars!!";
  const key = "sk-ant-SECRET-1234";
  const enc = encryptWithSecret(key, secret);
  expect("isEncrypted true for ciphertext", isEncrypted(enc));
  expect("isEncrypted false for plaintext", !isEncrypted(key));
  expect("ciphertext not plaintext", enc.indexOf(key) === -1);
  expect("round-trips with right secret", decryptWithSecret(enc, secret) === key);
  expect("wrong secret -> null", decryptWithSecret(enc, "different-secret") === null);
  expect("tampered -> null", decryptWithSecret(enc.slice(0, -2) + "xx", secret) === null);
  expect("malformed -> null", decryptWithSecret("not-a-token", secret) === null);
  // Distinct IV each call -> different ciphertext for the same input.
  expect("non-deterministic ciphertext", encryptWithSecret(key, secret) !== enc);
}

// (b) Provider registry.
{
  expect("isAiProvider claude/openai/gemini", isAiProvider("claude") && isAiProvider("openai") && isAiProvider("gemini"));
  expect("isAiProvider rejects junk", !isAiProvider("grok"));
  expect("default model claude is sonnet 4.6", DEFAULT_MODEL.claude === "claude-sonnet-4-6");
}

// (c) Prompt builder: raw scores only, name, band, word target + CTA.
{
  const sample = {
    firstName: "Ganesh",
    profession: "Doctor",
    assessmentTitle: "Executive Emotional Stability Assessment",
    scoreRaw: 45,
    max: 60,
    percentage: 75,
    band: "Unstable",
    categories: [
      { name: "Inner Pressure & Mental Burden", score: 9, max: 12 },
      { name: "Relationships & Presence", score: 10, max: 12 },
    ],
    guidance: "Higher scores mean more strain.",
  };
  const { user } = buildStatementMessages(sample);
  expect("user has first name", user.includes("Ganesh"));
  expect("user has profession", user.includes("Profession: Doctor"));
  expect("user has overall score", user.includes("45/60") && user.includes("75%"));
  expect("user has band (direction)", user.includes("Unstable"));
  expect("user has raw category score", user.includes("Inner Pressure & Mental Burden: 9/12"));
  expect("user has guidance", user.includes("Higher scores mean more strain."));
  // The active (default) prompt must steer by profession + not manufacture a name.
  const { system: activeSys } = buildStatementMessages(sample);
  expect("active prompt uses profession", /profession/i.test(activeSys));
  expect("active prompt forbids inventing a name", /do not invent/i.test(activeSys));

  // Invariants EVERY prompt version must satisfy.
  for (const v of PROMPT_VERSIONS) {
    const { system } = buildStatementMessages(sample, v.id);
    expect(`[${v.id}] sets 170-240 words`, system.includes("170") && system.includes("240"));
    expect(`[${v.id}] addresses by name`, /name/i.test(system));
    expect(`[${v.id}] points to the training video`, /video/i.test(system) || /training/i.test(system));
    expect(`[${v.id}] human tone, not an AI`, /not an ai/i.test(system));
  }
}

// (c2) Per-question detail flows into the user message (the "meaning" signal).
{
  const { user } = buildStatementMessages({
    firstName: "Chandini",
    assessmentTitle: "Executive Emotional Stability Assessment",
    scoreRaw: 46,
    max: 60,
    percentage: 77,
    band: "Critical",
    bandLevel: "CRITICAL",
    categories: [
      {
        name: "Inner Pressure & Mental Burden",
        score: 9,
        max: 12,
        band: "Unstable",
        questions: [
          { text: "How often do you feel mentally overloaded?", answer: "Almost always", score: 4, max: 4 },
        ],
      },
    ],
  });
  expect("user lists the question text", user.includes("How often do you feel mentally overloaded?"));
  expect("user shows the chosen answer", user.includes('answered "Almost always"'));
  expect("user shows the per-question score", user.includes("(4/4)"));
  expect("category head still present", user.includes("Inner Pressure & Mental Burden: 9/12"));
}

// (c3) buildCategoryQuestionBreakdown: weighted score/max, excludes unanswered.
{
  const cats = [
    {
      name: "C1",
      questions: [
        { id: "q1", text: "Q one", weight: 1, options: [{ id: "o1", value: 1, label: "Low" }, { id: "o2", value: 4, label: "High" }] },
        { id: "q2", text: "Q two", weight: 2, options: [{ id: "o3", value: 0, label: "No" }, { id: "o4", value: 3, label: "Yes" }] },
        { id: "q3", text: "Skipped", weight: 1, options: [{ id: "o5", value: 1, label: "x" }] },
      ],
    },
    { name: "Empty", questions: [{ id: "q4", text: "None answered", weight: 1, options: [{ id: "o6", value: 2, label: "y" }] }] },
  ];
  const ans = new Map([
    ["q1", { value: 4, optionId: "o2" }],
    ["q2", { value: 3, optionId: "o4" }],
  ]);
  const bd = buildCategoryQuestionBreakdown(cats, ans);
  expect("breakdown drops empty category", bd.length === 1 && bd[0]?.name === "C1");
  expect("breakdown excludes unanswered question", bd[0]?.questions.length === 2);
  expect("breakdown weighted score/max", bd[0]?.questions[1]?.score === 6 && bd[0]?.questions[1]?.max === 6);
  expect("breakdown resolves chosen answer label", bd[0]?.questions[0]?.answer === "High");
}

// (d) Missing name falls back gracefully.
{
  const { user } = buildStatementMessages({
    firstName: null,
    assessmentTitle: "X",
    scoreRaw: 1,
    max: 2,
    percentage: 50,
    band: null,
    categories: [],
  });
  expect("null name -> 'there'", user.includes("First name: there"));
  expect("no categories -> (none)", user.includes("(none)"));
}

// (e) humanizeStatement: em/en dashes -> commas, no AI tells.
{
  expect("em dash -> comma", humanizeStatement("world — a sense") === "world, a sense");
  expect("no-space dash -> comma", humanizeStatement("a—b") === "a, b");
  expect("en dash -> comma", humanizeStatement("x – y") === "x, y");
  expect("no double commas", humanizeStatement("a, — b") === "a, b");
  expect("no leftover em dash", humanizeStatement("p — q — r").indexOf("—") === -1);
  expect("plain text untouched", humanizeStatement("Hello there.") === "Hello there.");
}

console.log(`\n${failures === 0 ? "ALL PASSED" : `${failures} FAILED`}\n`);
process.exit(failures === 0 ? 0 : 1);

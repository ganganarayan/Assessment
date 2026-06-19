/**
 * AI personalized-statement verification (no DB, no network). Covers the secret
 * encryption round-trip and the pure prompt builder (raw scores only, no
 * per-category interpretation; word target + watch-the-video CTA present).
 *
 *   npx tsx scripts/verify-ai.ts
 */
import { encryptWithSecret, decryptWithSecret, isEncrypted } from "../src/lib/crypto";
import { buildStatementMessages, humanizeStatement } from "../src/lib/ai/prompt";
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
  const { system, user } = buildStatementMessages({
    firstName: "Ganesh",
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
  });
  expect("user has first name", user.includes("Ganesh"));
  expect("user has overall score", user.includes("45/60") && user.includes("75%"));
  expect("user has band (direction)", user.includes("Unstable"));
  expect("user has raw category score", user.includes("Inner Pressure & Mental Burden: 9/12"));
  expect("user has guidance", user.includes("Higher scores mean more strain."));
  expect("system sets 100-150 words", system.includes("100") && system.includes("150"));
  expect("system asks to address by name", /name/i.test(system));
  expect("system pulls to watch the video", /video/i.test(system) && /end/i.test(system));
  expect("system says not AI", /not an ai/i.test(system));
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

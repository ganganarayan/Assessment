/**
 * Verify the guided setup sequence, without a database.
 *
 * The registry is data, and data that drives a branch can be wrong in ways tsc cannot
 * see: a duplicated key, a condition on an answer that has not been asked yet, a
 * ZeptoMail host that no longer matches the pattern the sender uses to choose HTTPS over
 * blocked SMTP. Each of those breaks a sequence that still compiles.
 *
 * Run: npm run verify:onboarding
 */
import {
  ONBOARDING_STEPS,
  EMAIL_PRESETS,
  visibleSteps,
  schemaFor,
  STEP_BY_KEY,
  type OnboardingAnswers,
} from "../src/features/onboarding/steps";

let failures = 0;

function check(name: string, ok: boolean, detail = ""): void {
  if (ok) {
    console.log(`  ok   ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${name}${detail ? ` - ${detail}` : ""}`);
  }
}

console.log("\nThe registry");
const keys = ONBOARDING_STEPS.map((s) => s.key);
check("every key is unique", new Set(keys).size === keys.length);
check("every step asks something", ONBOARDING_STEPS.every((s) => s.question.trim().length > 0));
check(
  "every choice step offers at least two",
  ONBOARDING_STEPS.filter((s) => s.kind === "choice").every((s) => (s.choices?.length ?? 0) >= 2),
);
check(
  "every check and hand-off can be left for later",
  ONBOARDING_STEPS.filter((s) => s.kind === "check" || s.kind === "handoff").every((s) => s.skippable === true),
);
check("STEP_BY_KEY covers the list", keys.every((k) => STEP_BY_KEY[k]?.key === k));

/**
 * A CONDITION MAY ONLY READ A QUESTION ALREADY ASKED.
 *
 * Probed rather than inspected: for each conditional step, evaluate its condition with
 * every LATER answer blanked. If the result changes, the step is gated on something the
 * person has not been asked yet, which on screen is a branch that never opens.
 */
console.log("\nBranching");
const allYes: OnboardingAnswers = Object.fromEntries(keys.map((k) => [k, "yes"]));
for (const [i, step] of ONBOARDING_STEPS.entries()) {
  if (!step.when) continue;
  const earlierOnly: OnboardingAnswers = Object.fromEntries(
    keys.map((k, j) => [k, j < i ? allYes[k] : null]),
  );
  check(
    `${step.key} is decided by an earlier answer`,
    step.when(allYes) === step.when(earlierOnly),
  );
}

console.log("\nThe paths somebody actually walks");
const metaAndZepto = visibleSteps({ metaUse: "yes", paymentsUse: "no", emailProvider: "zeptomail-in" }).map((s) => s.key);
check("Meta ads, no payments, ZeptoMail asks the pixel", metaAndZepto.includes("metaPixel"));
check("that path never asks for an SMTP host", !metaAndZepto.includes("smtpHost"));
check("that path never asks for a Razorpay key", !metaAndZepto.includes("razorpayKeyId"));
check("that path ends at the hand-off", metaAndZepto[metaAndZepto.length - 1] === "starterTemplate");

const noMeta = visibleSteps({ metaUse: "no", paymentsUse: "yes", emailProvider: "other" }).map((s) => s.key);
check("no Meta means no pixel and no pixel check", !noMeta.includes("metaPixel") && !noMeta.includes("metaCheck"));
check("taking payments asks all three Razorpay fields", ["razorpayKeyId", "razorpayKeySecret", "razorpayWebhookSecret"].every((k) => noMeta.includes(k)));
check("another provider asks host, port and user", ["smtpHost", "smtpPort", "smtpUser"].every((k) => noMeta.includes(k)));

const unanswered = visibleSteps({}).map((s) => s.key);
check("with nothing answered, no branch is open", !unanswered.includes("metaPixel") && !unanswered.includes("smtpHost"));
check("with nothing answered, the first question is the business name", unanswered[0] === "businessName");

console.log("\nValidation");
const cases: Array<[string, string, boolean]> = [
  ["emailFrom", "hello@divineleads.guru", true],
  ["emailFrom", "hello at divineleads", false],
  ["website", "https://divineleads.guru", true],
  ["website", "divineleads.guru", false],
  ["whatsapp", "+91 98765 43210", true],
  ["whatsapp", "call me", false],
  ["brandColor", "#16a34a", true],
  ["brandColor", "green", false],
  ["metaCapiToken", "EAAG0123456789abcdef", true],
  ["metaCapiToken", "short", false],
  ["metaUse", "yes", true],
  ["metaUse", "maybe", false],
  ["businessName", "", false],
];
for (const [key, value, expected] of cases) {
  const step = STEP_BY_KEY[key];
  if (!step) {
    check(`${key} exists`, false);
    continue;
  }
  const got = schemaFor(step).safeParse(value).success;
  check(`${key} ${expected ? "accepts" : "refuses"} ${JSON.stringify(value)}`, got === expected);
}

/**
 * 🔴 THE RAILWAY TRAP. The sender switches to ZeptoMail's HTTPS API when the host
 * matches this pattern, and only then; outbound SMTP is blocked on Railway, so a preset
 * host that stops matching does not fail loudly, it hangs for two minutes and reports a
 * connection timeout nobody can trace back to a preset.
 */
console.log("\nEmail presets");
const zeptoPattern = /(^|\.)zeptomail\./i;
for (const [name, preset] of Object.entries(EMAIL_PRESETS)) {
  check(`${name} sends over HTTPS, not blocked SMTP`, zeptoPattern.test(preset.host), preset.host);
  check(`${name} carries a port`, preset.port > 0 && preset.port < 65536);
}
check("the provider choices each have a preset or ask for the host", (() => {
  const choices = STEP_BY_KEY.emailProvider?.choices ?? [];
  return choices.every((c) => c.value === "other" || !!EMAIL_PRESETS[c.value]);
})());

console.log(failures === 0 ? "\n🟢 The sequence holds.\n" : `\n🔴 ${failures} check${failures === 1 ? "" : "s"} failed.\n`);
process.exit(failures === 0 ? 0 : 1);

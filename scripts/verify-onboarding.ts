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
  INDUSTRY_CATEGORIES,
  type OnboardingAnswers,
} from "../src/features/onboarding/steps";
import { EMAIL_PROVIDER_OPTIONS } from "../src/lib/email/catalog";
import { BOOKING_PREREQUISITES } from "../src/features/onboarding/prerequisites";

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
check(
  "every info and link step has something to press",
  ONBOARDING_STEPS.filter((s) => s.kind === "info" || s.kind === "link").every((s) => !!s.cta || !!s.link),
);
check(
  "the ad link step is the one that shows both links",
  STEP_BY_KEY.copyAdLink?.kind === "link" && ONBOARDING_STEPS.filter((s) => s.kind === "link").length === 1,
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
const metaAndZepto = visibleSteps({ metaUse: "yes", razorpayAccount: "none", emailProvider: "zeptomail-in" }).map((s) => s.key);
check("Meta ads, nobody paying, ZeptoMail asks the pixel", metaAndZepto.includes("metaPixel"));
check("that path never asks for an SMTP host", !metaAndZepto.includes("smtpHost"));
check("that path never asks for a Razorpay key", !metaAndZepto.includes("razorpayKeyId"));
check("that path ends where the numbers are", metaAndZepto[metaAndZepto.length - 1] === "whereDataWindow");
check(
  "the funnel comes after the plumbing and before the ad link",
  metaAndZepto.indexOf("starterTemplate") > metaAndZepto.indexOf("emailCheck") &&
    metaAndZepto.indexOf("starterTemplate") < metaAndZepto.indexOf("copyAdLink"),
);
check(
  "the page is chosen before the funnel is imported",
  metaAndZepto.indexOf("resultPageKind") < metaAndZepto.indexOf("starterTemplate"),
);
check(
  "the preview comes before the link goes in an ad",
  metaAndZepto.indexOf("previewTest") < metaAndZepto.indexOf("copyAdLink"),
);

const noMeta = visibleSteps({ metaUse: "no", razorpayAccount: "gst", emailProvider: "other" }).map((s) => s.key);
check("no Meta means no pixel and no pixel check", !noMeta.includes("metaPixel") && !noMeta.includes("metaCheck"));
check("naming an account asks all three Razorpay fields", ["razorpayKeyId", "razorpayKeySecret", "razorpayWebhookSecret"].every((k) => noMeta.includes(k)));
check(
  "the non-GST account asks the same three",
  ["razorpayKeyId", "razorpayKeySecret", "razorpayWebhookSecret"].every((k) =>
    visibleSteps({ razorpayAccount: "nongst" }).some((s) => s.key === k),
  ),
);
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
  ["razorpayAccount", "nongst", true],
  ["razorpayAccount", "both", false],
  ["resultPageKind", "VSL", true],
  ["resultPageKind", "pdf", false],
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
 * 🔴 THE RAILWAY TRAP. Outbound SMTP is blocked there, so every provider offered during
 * onboarding except "my own SMTP server" has to be one that posts over HTTPS. A preset
 * pointing at an id the registry does not carry falls back to SMTP at send time, where
 * the failure is not an error anybody can trace back to here: it is a two-minute hang
 * and a connection timeout, on a workspace that answered every question correctly.
 */
console.log("\nEmail presets");
for (const [name, preset] of Object.entries(EMAIL_PRESETS)) {
  const option = EMAIL_PROVIDER_OPTIONS.find((p) => p.id === preset.providerId);
  check(`${name} names a provider the app has`, !!option, preset.providerId);
  check(`${name} sends over HTTPS, not blocked SMTP`, option?.transport === "HTTPS", preset.providerId);
  // A host is optional now - only ZeptoMail keeps one - but a host without a usable
  // port would leave the SMTP fields half-filled behind anybody who later switches.
  if (preset.host) {
    check(`${name} carries a port with its host`, !!preset.port && preset.port > 0 && preset.port < 65536);
  }
}
check("the provider choices each have a preset or ask for the host", (() => {
  const choices = STEP_BY_KEY.emailProvider?.choices ?? [];
  return choices.every((c) => c.value === "other" || !!EMAIL_PRESETS[c.value]);
})());

/**
 * The booking prerequisites, which the trial ribbon renders by name.
 *
 * Two ways this breaks silently, and both of them break the one list that tells a tenant
 * what to go and fetch before the setup call:
 *
 *  - A prerequisite whose step key no longer exists is never outstanding, because
 *    outstandingPrerequisites skips items that are not in the sequence (which is what
 *    makes the Razorpay branch work). A renamed step would therefore light the booking
 *    button for everybody, and nothing anywhere would say so.
 *  - A prerequisite with no short label renders as its whole question, in a ribbon that
 *    has room for three words, on a phone.
 */
console.log("");
console.log("Booking prerequisites");
for (const p of BOOKING_PREREQUISITES) {
  const step = STEP_BY_KEY[p.key];
  check(`${p.key} is a real step`, !!step);
  if (!step) continue;
  check(`${p.key} has a short label`, !!step.short, step.short);
  if (p.requires !== undefined) {
    const values = (step.choices ?? []).map((c) => c.value);
    check(`${p.key} can be answered ${p.requires}`, values.includes(p.requires), values.join("/"));
  }
}

/**
 * The industry choices have to BE the template library's categories, because the import
 * step matches on them. A category added to the library and not here leaves the tenants
 * it describes picking "Something else" and asking us to build a template we already
 * have.
 */
console.log("");
console.log("Industry choices");
const industryValues = (STEP_BY_KEY.industry?.choices ?? []).map((c) => c.value);
check("every category is offered", INDUSTRY_CATEGORIES.every((c) => industryValues.includes(c)));
check("Something else is offered last", industryValues[industryValues.length - 1] === "other");
check("the follow-up appears only for Something else", (() => {
  const step = STEP_BY_KEY.industryOther;
  if (!step?.when) return false;
  return step.when({ industry: "other" }) && !step.when({ industry: "Coaches" });
})());

console.log(failures === 0 ? "\n🟢 The sequence holds.\n" : `\n🔴 ${failures} check${failures === 1 ? "" : "s"} failed.\n`);
process.exit(failures === 0 ? 0 : 1);

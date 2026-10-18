import { z } from "zod";

/**
 * THE SETUP SEQUENCE, as data.
 *
 * One question per step, in the order it has to be asked, and nothing else: no save
 * logic, no prisma, no server imports. The dialog renders from this and the server
 * validates against it, which is the only way both can agree on what step 7 is.
 *
 * WHAT IS AND IS NOT IN HERE. These are the things a workspace cannot operate without:
 * who they are, Meta, payments, the sender, the colour, the call link, support. The
 * assessment is NOT a step - it is the hand-off at the end, because a funnel is the
 * work the product exists for and asking somebody to build one before their pixel
 * resolves is how a funnel goes live reporting to nobody.
 *
 * ORDER IS NOT ARBITRARY. Identity first, because the sender's display name and the
 * emails are written from it. Meta second, because it is the one that silently costs
 * money when it is missing. The sender before the colour, because a test email proves
 * a live credential and a colour proves nothing.
 *
 * ADDING A STEP is one entry here plus one case in save.ts. Position and completion are
 * computed from this list against what the workspace has answered, so inserting a step
 * in the middle moves everybody's "next" by one and strands nobody.
 */

export type StepKind =
  /** One line of text. */
  | "text"
  | "email"
  | "url"
  | "phone"
  /** A credential: never rendered back, never journalled. */
  | "secret"
  /** Buttons. One tap answers and advances. */
  | "choice"
  | "color"
  /** Not a question: the app checks what was just configured and reports. */
  | "check"
  /** The last one: import a template and leave for the builder. */
  | "handoff";

export interface StepChoice {
  value: string;
  label: string;
  hint?: string;
}

/** What has been answered so far, keyed by step. Secrets read back as "saved". */
export type OnboardingAnswers = Record<string, string | null | undefined>;

export interface OnboardingStepDef {
  key: string;
  kind: StepKind;
  /** The one question, as it is asked on screen. */
  question: string;
  /** One line under it. Say why it matters, not how to use the field. */
  hint?: string;
  placeholder?: string;
  choices?: StepChoice[];
  /** Offers "I will do this later", which records a skip rather than an answer. */
  skippable?: boolean;
  /** Asked only when this is true of the answers so far. Pure, so the dialog and the
   *  server reach the same conclusion without asking each other. */
  when?: (a: OnboardingAnswers) => boolean;
  /** The button on a check or hand-off step, where "Next" would be wrong. */
  cta?: string;
}

const runsMeta = (a: OnboardingAnswers) => a.metaUse === "yes";
const takesPayments = (a: OnboardingAnswers) => a.paymentsUse === "yes";
const ownSmtp = (a: OnboardingAnswers) => a.emailProvider === "other";

export const ONBOARDING_STEPS: readonly OnboardingStepDef[] = [
  {
    key: "businessName",
    kind: "text",
    question: "What is your business called?",
    hint: "It names your workspace and signs the emails your funnel sends.",
    placeholder: "Divine Leads",
  },
  {
    key: "website",
    kind: "url",
    question: "What is your website?",
    hint: "Only so support knows what you sell. Nothing is published to it.",
    placeholder: "https://",
    skippable: true,
  },
  {
    key: "whatsapp",
    kind: "phone",
    question: "Which WhatsApp number should we reach you on?",
    hint: "Support replies come here. With your country code, or ten digits for India.",
    placeholder: "+91",
  },
  {
    key: "metaUse",
    kind: "choice",
    question: "Do you run Meta ads for this business?",
    choices: [
      { value: "yes", label: "Yes", hint: "Two more questions and your ads can optimise on qualified leads." },
      { value: "no", label: "Not yet", hint: "Skip it. Settings has the same two fields whenever you start." },
    ],
  },
  {
    key: "metaPixel",
    kind: "text",
    question: "What is your Meta Pixel ID?",
    hint: "Events Manager, Data sources. Fifteen or sixteen digits.",
    placeholder: "1234567890123456",
    when: runsMeta,
  },
  {
    key: "metaCapiToken",
    kind: "secret",
    question: "Paste your Conversions API token.",
    hint: "Events Manager, your dataset, Settings, Generate access token. Without it your funnel collects leads and tells your ad account nothing, which looks exactly like a funnel that is not working.",
    when: runsMeta,
  },
  {
    key: "metaCheck",
    kind: "check",
    question: "Let me check that Meta is really connected.",
    hint: "Reading the same two values your live funnel reads, so this cannot disagree with what actually fires.",
    cta: "Check it",
    skippable: true,
    when: runsMeta,
  },
  {
    key: "paymentsUse",
    kind: "choice",
    question: "Will people pay you inside the funnel?",
    choices: [
      { value: "yes", label: "Yes, I take payments", hint: "Three Razorpay fields." },
      { value: "no", label: "Not now", hint: "Your funnel runs free until you turn it on." },
    ],
  },
  {
    key: "razorpayKeyId",
    kind: "text",
    question: "What is your Razorpay Key ID?",
    hint: "Razorpay dashboard, Account and settings, API keys.",
    placeholder: "rzp_live_...",
    when: takesPayments,
  },
  {
    key: "razorpayKeySecret",
    kind: "secret",
    question: "Paste your Razorpay Key Secret.",
    hint: "Shown once, when the key is generated. Stored encrypted and used only for your workspace.",
    when: takesPayments,
  },
  {
    key: "razorpayWebhookSecret",
    kind: "secret",
    question: "Paste your Razorpay webhook secret.",
    hint: "Create the webhook in Razorpay first. The URL to paste there is on your Settings screen, and without this secret a successful payment never reaches your funnel.",
    when: takesPayments,
  },
  {
    key: "emailProvider",
    kind: "choice",
    question: "Who sends your email?",
    hint: "Your funnel emails leads, and password resets go the same way.",
    choices: [
      { value: "zeptomail-in", label: "ZeptoMail India", hint: "zeptomail.in. Sends over HTTPS, so nothing is blocked." },
      { value: "zeptomail-com", label: "ZeptoMail global", hint: "zeptomail.com, for an account outside India." },
      { value: "other", label: "Another provider", hint: "Any SMTP server. Three more questions." },
    ],
  },
  {
    key: "smtpHost",
    kind: "text",
    question: "What is your SMTP host?",
    placeholder: "smtp.yourprovider.com",
    when: ownSmtp,
  },
  {
    key: "smtpPort",
    kind: "text",
    question: "Which port?",
    hint: "587 for STARTTLS, 465 for TLS. 🟡 A host that blocks outbound SMTP will time out on both, which is why ZeptoMail is the safer answer.",
    placeholder: "587",
    when: ownSmtp,
  },
  {
    key: "smtpUser",
    kind: "text",
    question: "What is the SMTP username?",
    hint: "Usually the full sending address.",
    when: ownSmtp,
  },
  {
    key: "emailFrom",
    kind: "email",
    question: "Which address should your email come from?",
    hint: "It has to be on a domain you have verified with your provider, or it will be refused.",
    placeholder: "hello@yourbusiness.com",
  },
  {
    key: "emailToken",
    kind: "secret",
    question: "Paste your sending token.",
    hint: "ZeptoMail calls it the Mail Agent's Send Mail token. On another provider it is the SMTP password.",
  },
  {
    key: "emailCheck",
    kind: "check",
    question: "Let me send you a real test email.",
    hint: "To your own login address. This is the only thing that proves the credential, the from address and the domain all agree.",
    cta: "Send it",
    skippable: true,
  },
  {
    key: "brandColor",
    kind: "color",
    question: "What is your brand colour?",
    hint: "Your funnel's buttons and progress bar use it.",
    placeholder: "#16a34a",
  },
  {
    key: "bookingUrl",
    kind: "url",
    question: "Where do people book a call with you?",
    hint: "Your calendar link. It becomes the button a qualified lead sees at the end.",
    placeholder: "https://cal.com/you/30min",
    skippable: true,
  },
  {
    key: "supportEmail",
    kind: "email",
    question: "Where should a respondent's support email go?",
    hint: "Shown to the people taking your assessment when something goes wrong.",
  },
  {
    key: "starterTemplate",
    kind: "handoff",
    question: "Last one. Import your first funnel.",
    hint: "A working gate and scorecard, not a blank page. It opens in the builder and everything in it is yours to edit.",
    cta: "Import it",
    // Somebody who would rather build their own must not be held on the last question.
    skippable: true,
  },
];

export const STEP_BY_KEY: Record<string, OnboardingStepDef> = Object.fromEntries(
  ONBOARDING_STEPS.map((s) => [s.key, s]),
);

/** The steps this workspace is actually asked, with the conditions applied. */
export function visibleSteps(answers: OnboardingAnswers): OnboardingStepDef[] {
  return ONBOARDING_STEPS.filter((s) => !s.when || s.when(answers));
}

/**
 * ZeptoMail's two regions, as presets.
 *
 * The host is the whole decision: the sender rewrites `smtp.` to `api.` and posts over
 * HTTPS when it sees a zeptomail host, which is what makes mail work on Railway at all
 * (outbound SMTP ports are blocked there, and the failure is a two-minute timeout
 * rather than an error anybody can read). The port is stored because the sender
 * requires one, not because a ZeptoMail send ever opens it.
 */
export const EMAIL_PRESETS: Record<string, { host: string; port: number; secure: boolean }> = {
  "zeptomail-in": { host: "smtp.zeptomail.in", port: 587, secure: false },
  "zeptomail-com": { host: "smtp.zeptomail.com", port: 587, secure: false },
};

/** Per-kind validation, shared so the dialog and the server refuse the same things. */
export function schemaFor(step: OnboardingStepDef): z.ZodType<string> {
  switch (step.kind) {
    case "email":
      return z.string().trim().email("That does not look like an email address.");
    case "url":
      return z
        .string()
        .trim()
        .regex(/^https?:\/\/.+\..+/i, "Start with https:// and include the domain.");
    case "phone":
      return z
        .string()
        .trim()
        .regex(/^\+?[\d\s()-]{7,20}$/, "Digits only, with an optional country code.");
    case "color":
      return z
        .string()
        .trim()
        .regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, "A hex colour, like #16a34a.");
    case "choice":
      return z.enum((step.choices ?? []).map((c) => c.value) as [string, ...string[]]);
    case "secret":
      return z.string().trim().min(8, "That looks too short to be a token.");
    default:
      return z.string().trim().min(1, "This one cannot be blank.");
  }
}

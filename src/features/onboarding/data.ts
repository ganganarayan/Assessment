import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig } from "@/lib/settings/config";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";
import { listTemplatesForTenant } from "@/features/templates/data";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import {
  ONBOARDING_STEPS,
  visibleSteps,
  type OnboardingAnswers,
  type OnboardingStepDef,
  type StepChoice,
  type StepKind,
} from "@/features/onboarding/steps";

/**
 * WHERE THIS WORKSPACE IS IN ITS SETUP, resolved from two sources and no stored pointer.
 *
 * 1. The journal (onboarding_answer): the questions they have answered or skipped.
 * 2. THE FACTS: the pixel that resolves, the sender that is configured, the colour that
 *    exists, the funnel they built, the preview they ran, the funnel they published.
 *
 * The facts are read first and they are why this can be switched on for an install that
 * already has customers: a workspace that configured everything by hand months ago is
 * not asked for any of it again, because the question is "is this set" and not "did you
 * tell us". It is also what makes a stored answer impossible to lie with - a journal row
 * claiming the pixel is done cannot survive a pixel that does not resolve, since the
 * fact is merged over it.
 *
 * Two of those facts are what turn this from a form into something that follows them:
 * the preview run and the first publish are both discovered, so publishing a funnel in
 * the builder is what moves the sequence on to the link for their ad.
 *
 * The POSITION is the first visible step with neither. Recomputed on every load, so the
 * same person resumes in the same place on another device, after a reorder, and after a
 * step is added.
 */

/** One step, flattened for the client. The registry's `when` is a function and must
 *  never cross the boundary, so the conditions are applied here. */
export interface OnboardingStepView {
  key: string;
  kind: StepKind;
  question: string;
  hint?: string;
  placeholder?: string;
  choices?: StepChoice[];
  skippable?: boolean;
  cta?: string;
  link?: { href: string; label: string };
  /** What is on record. Null for a secret, which never comes back. */
  value: string | null;
  answered: boolean;
  skipped: boolean;
}

/**
 * The few live details the copy cannot carry: which funnel to preview, which to open,
 * which slug goes in the ad. Slugs rather than URLs, because the absolute link is built
 * from the origin the operator is actually browsing - the same rule the Copy link button
 * on the Assessments screen follows, and the reason it is right on a custom domain.
 */
export interface OnboardingContext {
  hasFunnel: boolean;
  /** The newest funnel in this workspace, for the builder link. */
  assessmentId: string | null;
  /** Its slug, for the preview run. */
  previewSlug: string | null;
  /** The published funnel's slug, for the ad. Null until something is published. */
  publishedSlug: string | null;
}

export interface OnboardingView {
  steps: OnboardingStepView[];
  /** The step to ask now. Null when there is nothing left. */
  currentKey: string | null;
  /** 1-based, for "step 4 of 24". 0 when complete. */
  currentNumber: number;
  doneCount: number;
  total: number;
  complete: boolean;
  /**
   * They have answered at least one question, so this workspace is being set up through
   * the sequence and the dialog may keep showing itself as they go.
   *
   * 🟡 THIS IS THE WHOLE "DO NOT HARASS AN EXISTING CUSTOMER" RULE. A workspace that has
   * been running for months has no journal rows and plenty of unanswered steps, and
   * being interrupted to confirm its own business name is exactly what must not happen.
   * No rows and a funnel already built means the sequence waits to be opened.
   */
  started: boolean;
  context: OnboardingContext;
}

/**
 * Resolve the sequence for one workspace. Null for the platform or an internal tenant:
 * neither is being onboarded, and a setup dialog on the owner's own console is noise.
 */
export async function getOnboardingView(
  tenantId: string | null,
  userId: string,
): Promise<OnboardingView | null> {
  if (!isBusinessTenant(tenantId)) return null;

  const [rows, meta, settings, theme, me, newest, published, previews, resultDoc, wabaOffered] = await Promise.all([
    prisma.onboardingAnswer.findMany({
      where: { tenantId },
      select: { stepKey: true, value: true, skipped: true },
    }),
    // The same accessor the funnel uses, so "connected" here means the same thing it
    // means at the moment an event fires.
    resolveMetaConfig(tenantId),
    prisma.appSetting.findUnique({
      where: { tenantId },
      select: {
        metaNotUsed: true,
        razorpayKeyId: true,
        razorpayKeySecretEnc: true,
        razorpayWebhookSecretEnc: true,
        razorpayNonGstKeyId: true,
        razorpayNonGstKeySecretEnc: true,
        razorpayNonGstWebhookSecretEnc: true,
        smtpHost: true,
        smtpPort: true,
        smtpUser: true,
        smtpFromEmail: true,
        smtpPassEnc: true,
        wabaPhoneNumberId: true,
        bookingUrl: true,
        supportEmail: true,
      },
    }),
    // The ROW, not getThemeColors: that one answers with the defaults when there is no
    // row, and a default is not a colour anybody chose.
    prisma.theme.findUnique({ where: { tenantId }, select: { primaryColor: true } }),
    prisma.user.findUnique({ where: { id: userId }, select: { whatsapp: true } }),
    prisma.assessment.findFirst({
      where: { tenantId },
      orderBy: { createdAt: "desc" },
      select: { id: true, slug: true },
    }),
    prisma.assessment.findFirst({
      where: { tenantId, status: "PUBLISHED" },
      orderBy: { createdAt: "asc" },
      select: { slug: true },
    }),
    // A preview run is a real row carrying isPreview, which is also what keeps it out
    // of the plan's response count and away from the Conversions API.
    prisma.submission.count({ where: { tenantId, isPreview: true } }),
    prisma.resultPageDoc.findFirst({
      where: { tenantId },
      orderBy: { updatedAt: "desc" },
      select: { kind: true },
    }),
    // Whether the one-click connect can work at all on this install.
    wabaVisible(tenantId),
  ]);

  const journal = new Map(rows.map((r) => [r.stepKey, r]));

  /**
   * Which Razorpay account this workspace is being asked about. Their own answer first;
   * failing that, whichever one already carries a key - a workspace that configured the
   * non-GST account by hand must not be asked for the GST one.
   */
  const account =
    journal.get("razorpayAccount")?.value ??
    (settings?.razorpayKeyId ? "gst" : settings?.razorpayNonGstKeyId ? "nongst" : null);
  const rzp =
    account === "nongst"
      ? {
          keyId: settings?.razorpayNonGstKeyId ?? null,
          secret: settings?.razorpayNonGstKeySecretEnc ?? null,
          webhook: settings?.razorpayNonGstWebhookSecretEnc ?? null,
        }
      : {
          keyId: settings?.razorpayKeyId ?? null,
          secret: settings?.razorpayKeySecretEnc ?? null,
          webhook: settings?.razorpayWebhookSecretEnc ?? null,
        };

  /**
   * What the app can see for itself. A value means the step is already satisfied; null
   * means it has nothing to say and the journal decides.
   *
   * `metaUse` and `razorpayAccount` are inferred rather than asked twice: a workspace
   * with a pixel saved plainly runs Meta ads, and being asked whether they do would read
   * as the product having forgotten.
   */
  const facts: OnboardingAnswers = {
    whatsapp: me?.whatsapp ?? null,
    metaUse: settings?.metaNotUsed ? "no" : meta.pixelId ? "yes" : null,
    metaPixel: meta.pixelId ?? null,
    metaCapiToken: meta.capiToken ? "saved" : null,
    razorpayAccount: account,
    razorpayKeyId: rzp.keyId,
    razorpayKeySecret: rzp.secret ? "saved" : null,
    razorpayWebhookSecret: rzp.webhook ? "saved" : null,
    emailProvider: providerFromHost(settings?.smtpHost ?? null),
    smtpHost: settings?.smtpHost ?? null,
    smtpPort: settings?.smtpPort != null ? String(settings.smtpPort) : null,
    smtpUser: settings?.smtpUser ?? null,
    emailFrom: settings?.smtpFromEmail ?? null,
    emailToken: settings?.smtpPassEnc ? "saved" : null,
    /**
     * Already connected, or impossible to connect on this install: either way there is
     * nothing to ask. An install with no Meta app configured cannot run the one-click
     * flow at all, and offering a button that opens a broken popup is worse than
     * leaving the number to Settings.
     */
    whatsappConnect: settings?.wabaPhoneNumberId ? "connected" : wabaOffered ? null : "unavailable",
    brandColor: theme?.primaryColor ?? null,
    bookingUrl: settings?.bookingUrl ?? null,
    supportEmail: settings?.supportEmail ?? null,
    // They already have a page, so the import knows which one to bring.
    resultPageKind: resultDoc?.kind ?? null,
    // They already have a funnel, so the hand-off has nothing to hand over.
    starterTemplate: newest ? "done" : null,
    previewTest: previews > 0 ? "done" : null,
    publishFunnel: published ? "done" : null,
  };

  /**
   * The merged answers, which is what the registry's conditions are evaluated against.
   *
   * A SKIP READS AS NO ANSWER, deliberately: somebody who skipped "do you run Meta ads"
   * is not then asked for a pixel, because they have just said they do not want to deal
   * with it now. The branch comes back whenever they answer the question.
   */
  const answers: OnboardingAnswers = {};
  for (const step of ONBOARDING_STEPS) {
    const row = journal.get(step.key);
    answers[step.key] = row?.skipped ? null : row?.value ?? facts[step.key] ?? null;
  }

  const visible = visibleSteps(answers);
  const steps: OnboardingStepView[] = visible.map((step) => {
    const row = journal.get(step.key);
    const fact = facts[step.key] ?? null;
    const skipped = row?.skipped === true;
    const answered = (!!row && !skipped) || fact != null;
    return {
      ...flatten(step),
      // A credential is never rendered back. Read off the KIND rather than a list of
      // keys: a list is a second place to remember, and the one time it is forgotten is
      // the time a token goes to a browser.
      value: step.kind === "secret" ? null : row?.value ?? fact ?? null,
      answered,
      skipped,
    };
  });

  const next = steps.find((s) => !s.answered && !s.skipped) ?? null;
  const doneCount = steps.filter((s) => s.answered).length;
  return {
    steps,
    currentKey: next?.key ?? null,
    currentNumber: next ? steps.findIndex((s) => s.key === next.key) + 1 : 0,
    doneCount,
    total: steps.length,
    // Skipped counts as settled: the sequence is a sequence, not a wall, and somebody
    // who said "later" twice should not be shown an unfinished dialog forever.
    complete: steps.every((s) => s.answered || s.skipped),
    started: rows.length > 0,
    context: {
      hasFunnel: !!newest,
      assessmentId: newest?.id ?? null,
      previewSlug: newest?.slug ?? null,
      publishedSlug: published?.slug ?? null,
    },
  };
}

/** Which preset a stored host corresponds to, so a configured workspace is not asked. */
function providerFromHost(host: string | null): string | null {
  if (!host) return null;
  if (/zeptomail\.in$/i.test(host)) return "zeptomail-in";
  if (/zeptomail\.com$/i.test(host)) return "zeptomail-com";
  return "other";
}

/** The serialisable half of a step definition. `when` is left behind deliberately. */
function flatten(step: OnboardingStepDef) {
  return {
    key: step.key,
    kind: step.kind,
    question: step.question,
    ...(step.hint ? { hint: step.hint } : {}),
    ...(step.placeholder ? { placeholder: step.placeholder } : {}),
    ...(step.choices ? { choices: step.choices } : {}),
    ...(step.skippable ? { skippable: step.skippable } : {}),
    ...(step.cta ? { cta: step.cta } : {}),
    ...(step.link ? { link: step.link } : {}),
  };
}

/**
 * What the hand-off offers, and in what order.
 *
 * Sorted by the OWNER'S displayOrder and not by category. The shelf groups by audience,
 * which is right for browsing twenty templates and wrong for a dialog that is offering
 * the one a new workspace should start from: the owner decides that, by putting it
 * first on the Templates screen. Six, because this is the last question in a sequence
 * and a list you have to scroll is a decision nobody wanted.
 */
export async function getStarterTemplates(tenantId: string): Promise<
  Array<{
    id: string;
    title: string;
    category: string;
    summary: string | null;
    questions: number;
    gateQuestions: number;
    hasResultsPage: boolean;
    hasVslPage: boolean;
  }>
> {
  const items = await listTemplatesForTenant(tenantId);
  return items
    .filter((t) => t.importable)
    .sort((a, b) => a.displayOrder - b.displayOrder || a.title.localeCompare(b.title))
    .slice(0, 6)
    .map((t) => ({
      id: t.id,
      title: t.title,
      category: t.category,
      summary: t.summary,
      questions: t.questions,
      gateQuestions: t.gateQuestions,
      hasResultsPage: t.hasResultsPage,
      hasVslPage: t.hasVslPage,
    }));
}

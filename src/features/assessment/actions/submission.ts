"use server";

import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { ATTR_COOKIE } from "@/lib/attribution";
import {
  leadSchema,
  answersSchema,
  professionOptionsFor,
  type LeadInput,
  type AnswersInput,
} from "@/features/assessment/schemas";
import {
  computeScores,
  pickResultBand,
  type ScoringQuestion,
} from "@/features/assessment/scoring";
import { EventType, Prisma } from "@prisma/client";
import { emitEvent } from "@/lib/events/emit";
import { resultUrlFor } from "@/lib/events/completion";
import { normalizeAttribution } from "@/lib/events/payload";
import { type EmitInput, type PayloadCategory } from "@/features/events/types";
import { getCurrentUser } from "@/lib/auth/session";
import { isPlatformOwner } from "@/lib/auth/platform";
import { normalizeIdentifier, evaluateLockout } from "@/features/assessment/lockout";
import { isCrawlerUserAgent } from "@/lib/bots";
import { generateCustomerId, generateToken } from "@/lib/ids";
import { env } from "@/lib/env";
import { randomUUID } from "crypto";
import { sendCapiEvent, isCapiConfigured } from "@/lib/meta/send";
import { fbcCreationMs } from "@/lib/meta/capi";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { generatePersonalStatement, generateClinicStatement } from "@/lib/ai/generate";
import {
  resolveEngineConfig,
  deriveInputs,
  computeResult,
  isClinicRole,
  type RawAnswer,
  type ClinicRole,
  type ClinicAuditResult,
} from "@/lib/scoring/clinic-audit";
import { buildClinicContext, type ClinicPromptContext } from "@/lib/ai/clinic-prompt";
import { formatINR, pctLabel } from "@/lib/format/inr";
import { isRazorpayConfigured, createOrder } from "@/lib/payments/razorpay";
import { resolveRazorpayConfig } from "@/lib/settings/config";
import { type PaymentCheckout } from "@/lib/payments/types";

const PAYMENT_BUSINESS_NAME = "Assess360";
import { buildResultSnapshot, mapCategoryResult, type ClinicSnapshot } from "@/lib/result/snapshot";
import { buildCategoryQuestionBreakdown, type ChosenAnswer } from "@/lib/result/questions";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

/** The ONE system-level fallback for the result-token TTL (overridable per
 *  assessment). 30 days — long enough that revisits and the emailed result link
 *  (clicked hours/days later) still resolve; the token is a high-entropy,
 *  per-submission id behind which only that person's own result sits. */
const DEFAULT_RESULT_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

/** Destination URL the respondent lands on; falls back to the internal result page. */
function buildResultUrl(
  targetUrl: string | null,
  slug: string,
  submissionId: string,
  token: string | null,
): string {
  if (targetUrl && token) {
    try {
      const u = new URL(targetUrl);
      u.searchParams.set("t", token); // correct even if targetUrl already has a query/fragment
      return u.toString();
    } catch {
      /* malformed targetUrl — fall back to the internal result page */
    }
  }
  // Internal result page (used for "Show results on assess360" + as a fallback). Carry
  // the token so the respondent can view their results in-platform (token-gated).
  return `${env.NEXT_PUBLIC_APP_URL}/a/${slug}/r/${submissionId}${token ? `?t=${encodeURIComponent(token)}` : ""}`;
}

/**
 * Assemble the clinic-audit AI CONTEXT from the computed result + the answers.
 * Every figure is pre-formatted here so the model quotes it verbatim (it never
 * calculates). Close rate is labelled as held constant.
 */
function buildClinicPromptContext(
  result: ClinicAuditResult,
  questions: { id: string; text: string; options: { id: string; label: string }[] }[],
  optionByQuestionId: Map<string, string>,
  profession: string | null,
): ClinicPromptContext {
  const figures: { label: string; value: string }[] = [
    { label: "Cases today (per month)", value: `${result.casesNow}` },
    { label: "Revenue today (per month)", value: formatINR(result.revenueNow) },
    { label: "Revenue today (per year)", value: formatINR(result.revenueNow * 12) },
    { label: "Achievable cases (per month)", value: `${result.casesPotential}` },
    { label: "Achievable revenue (per month)", value: formatINR(result.revenuePotential) },
    { label: "The gap (per month)", value: formatINR(result.gap) },
    { label: "The gap (per year)", value: formatINR(result.annualGap) },
    { label: "Booking rate now → achievable", value: `${pctLabel(result.bookRateNow)} → ${pctLabel(result.bookRateImproved)}` },
    { label: "Show-up rate now → achievable", value: `${pctLabel(result.showUpNow)} → ${pctLabel(result.showUpImproved)}` },
    { label: "Close rate (held constant, never modelled improving)", value: pctLabel(result.closeRate) },
    { label: "Monthly enquiries", value: `${result.enquiries}` },
    { label: "Average treatment value", value: formatINR(result.treatmentValue) },
    {
      label: "To add five cases a month",
      value: `${result.fiveCases.attended} consultations attended, ${result.fiveCases.booked} booked, ${result.fiveCases.enquiries} enquiries, ${formatINR(result.fiveCases.adSpend)} ad spend`,
    },
    { label: "Dormant list recoverable", value: `${result.dormant.recoverable} cases (${formatINR(result.dormant.value)})` },
    { label: "Spare capacity (cases/month)", value: `${result.capacity}` },
  ];
  const answers: { q: string; a: string }[] = [];
  for (const q of questions) {
    const oid = optionByQuestionId.get(q.id);
    if (!oid) continue;
    const label = q.options.find((o) => o.id === oid)?.label;
    if (label) answers.push({ q: q.text, a: label });
  }
  return {
    clinicType: profession,
    band: result.band,
    figures,
    weakestClauses: result.weakestAreas.map((w) => w.clause),
    assumptions: result.assumptions,
    answers,
  };
}

/** Append ?t=<token> to a static payment link so the post-payment page can unlock. */
function withToken(paymentUrl: string, token: string | null): string {
  if (!token) return paymentUrl;
  try {
    const u = new URL(paymentUrl);
    u.searchParams.set("t", token);
    return u.toString();
  } catch {
    return paymentUrl;
  }
}

/**
 * What a paid submit should do INSTEAD of going to the destination/VSL. Razorpay
 * Checkout (a created Order + prefilled customer) when configured + a price is set —
 * the client opens the payment UI directly and Razorpay redirects to /api/payments/
 * verify on success. Otherwise the static payment link (with ?t=<token>). Both empty
 * when paid mode is off, or when paid is on but no method is usable (the caller must
 * then NOT fall through to the free VSL — see the runner).
 */
async function resolvePaidCheckout(opts: {
  tenantId: string | null;
  paidMode: boolean;
  paymentUrl: string | null;
  paymentAmount: number | null;
  submissionId: string;
  token: string | null;
  customer: { name: string | null; email: string | null; phone: string | null };
}): Promise<{ payment?: PaymentCheckout; paymentRedirectUrl?: string }> {
  if (!opts.paidMode) return {};

  const rzp = await resolveRazorpayConfig(opts.tenantId);
  if (isRazorpayConfigured(rzp) && rzp.keyId && opts.paymentAmount && opts.paymentAmount > 0) {
    try {
      const order = await createOrder({
        amountPaise: opts.paymentAmount * 100,
        currency: "INR",
        notes: { submissionId: opts.submissionId, purpose: "assessment_unlock" },
      }, rzp);
      const payment: PaymentCheckout = {
        keyId: rzp.keyId,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        name: PAYMENT_BUSINESS_NAME,
        description: "Assessment results + consultation",
        prefill: { name: opts.customer.name, email: opts.customer.email, contact: opts.customer.phone },
        callbackUrl: `${env.NEXT_PUBLIC_APP_URL}/api/payments/verify?submission=${encodeURIComponent(opts.submissionId)}`,
        notes: { submissionId: opts.submissionId },
      };
      return { payment };
    } catch {
      // Razorpay Checkout (the trackable method — its order carries the submissionId)
      // failed. Do NOT fall back to a bare static link here: that payment would have
      // no submissionId, so the webhook would (correctly) ignore it and the sale would
      // be lost from the stats/CRM/Meta. Return nothing → the runner shows a retry.
      return {};
    }
  }

  // No Razorpay Checkout configured (no keys/amount): use the static link if set.
  // NOTE: a fixed static link can't carry a per-buyer submissionId, so those sales
  // aren't auto-tracked — prefer the Price (Checkout) for tracked paid assessments.
  return opts.paymentUrl ? { paymentRedirectUrl: withToken(opts.paymentUrl, opts.token) } : {};
}


export type StartResult =
  | { status: "started"; submissionId: string; editToken: string; eventId?: string; answers?: Record<string, string> }
  | {
      status: "locked";
      policy: "DELAYED" | "NEVER";
      lastCompletedAt: string | null;
      nextAvailableAt: string | null; // null = never (NEVER policy)
    };

/** Load a resuming respondent's prior answers (questionId -> optionId): the live
 *  autosaved draft, else their final answers (a completed-but-unpaid resume). */
async function loadResumeAnswers(submissionId: string): Promise<Record<string, string>> {
  const s = await prisma.submission.findUnique({ where: { id: submissionId }, select: { draftAnswers: true } });
  const draft = (s?.draftAnswers ?? null) as Record<string, unknown> | null;
  if (draft && typeof draft === "object") {
    const out: Record<string, string> = {};
    for (const [q, o] of Object.entries(draft)) if (typeof o === "string") out[q] = o;
    if (Object.keys(out).length) return out;
  }
  const ans = await prisma.submissionAnswer.findMany({ where: { submissionId }, select: { questionId: true, optionId: true } });
  const out: Record<string, string> = {};
  for (const a of ans) out[a.questionId] = a.optionId;
  return out;
}

/** Autosave in-progress answers so a returning unpaid respondent resumes where
 *  they left off. No-op once paid (the submission is frozen). Public (keyed by id). */
export async function saveDraftAnswers(
  submissionId: string,
  answers: { questionId: string; optionId: string }[],
  editToken?: string,
): Promise<ActionResult> {
  const sub = await prisma.submission.findUnique({ where: { id: submissionId }, select: { completedPaidAt: true, editToken: true } });
  if (!sub) return { ok: false, error: "Not found." };
  // Ownership: a submission with an edit token requires it (legacy null-token rows,
  // created before this shipped, are allowed through).
  if (sub.editToken && sub.editToken !== editToken) return { ok: false, error: "Not authorized." };
  if (sub.completedPaidAt) return { ok: true }; // paid -> frozen
  const map: Record<string, string> = {};
  for (const a of answers ?? []) if (a?.questionId && a?.optionId) map[a.questionId] = a.optionId;
  await prisma.submission.update({ where: { id: submissionId }, data: { draftAnswers: map as unknown as Prisma.InputJsonValue } });
  return { ok: true };
}

type StartAssessment = {
  id: string;
  slug: string;
  title: string;
  tenant: { id: string; slug: string; name: string } | null;
};

/** Fire the single opt-in event (LEAD_CREATED -> "optin"). The old separate
 *  assessment.started event is merged into this one — only one webhook now. */
async function emitStart(
  assessment: StartAssessment,
  submissionId: string,
  customerId: string,
  lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null; profession: string | null },
  attr: ReturnType<typeof normalizeAttribution>,
) {
  await emitEvent(EventType.LEAD_CREATED, {
    submissionId,
    customerId,
    tenant: assessment.tenant,
    assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
    lead,
    attribution: attr ?? undefined,
  });
}

/**
 * Fire everything that happens on a NEW registration: the CRM events (lead.created
 * + assessment.started) AND a server-side Meta CAPI `CompleteRegistration`.
 * Returns the CAPI eventId so the browser pixel can fire with the SAME id and
 * Meta deduplicates the two. Called ONLY on the created path (never on resume),
 * so a registration is counted exactly once.
 */
async function fireRegistration(
  assessment: StartAssessment,
  submissionId: string,
  customerId: string,
  lead: { firstName: string | null; lastName: string | null; email: string | null; mobile: string | null; profession: string | null },
  attr: ReturnType<typeof normalizeAttribution>,
): Promise<string> {
  const eventId = randomUUID();
  // The submission is ALREADY persisted before this runs, so no CRM/CAPI side-effect
  // may ever block the lead. Everything here is wrapped: a failure is logged and the
  // opt-in still succeeds (the eventId is returned regardless for pixel dedup).
  try {
    await emitStart(assessment, submissionId, customerId, lead, attr);
    // Server-side Meta CAPI. Inert unless configured; getMetaRequestContext is
    // fail-soft; the send is fire-and-forget so Meta's network never adds latency.
    if (await isCapiConfigured(assessment.tenant?.id ?? null)) {
      const ctx = await getMetaRequestContext();
      void sendCapiEvent({
        eventName: "CompleteRegistration",
        eventId,
        eventTimeMs: Date.now(),
        eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${assessment.slug}`,
        user: {
          email: lead.email,
          phone: lead.mobile,
          firstName: lead.firstName,
          lastName: lead.lastName,
          ...ctx,
        },
        customData: { content_name: assessment.title, assessment_name: assessment.title },
      }, assessment.tenant?.id ?? null).catch(() => {});
    }
  } catch (e) {
    console.error("[start] fireRegistration side-effect failed (lead still captured):", e instanceof Error ? e.message : String(e));
  }
  return eventId;
}

/**
 * Start a submission: validate the lead per the assessment's capture config,
 * create the record immediately (status STARTED), and return its id so the
 * respondent can continue into the questions.
 */
/** Read the saved attribution cookie (set in middleware, last-touch); null if absent/bad. */
async function readAttributionCookie() {
  try {
    const raw = (await cookies()).get(ATTR_COOKIE)?.value;
    return raw ? normalizeAttribution(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

export async function startSubmission(
  slug: string,
  lead: LeadInput,
  attribution?: Record<string, string>,
  preview?: boolean,
  honeypot?: string,
  optinAnswers?: Record<string, string>,
): Promise<ActionResult<StartResult>> {
  // Bot guard #1 — honeypot: a hidden form field no human fills. If it carries a
  // value, silently refuse (no submission created) so bot opt-ins never pollute the
  // funnel. Same generic error a real user would never trigger.
  if (!preview && honeypot && honeypot.trim()) {
    console.warn(`[start] blocked by HONEYPOT (slug=${slug}, len=${honeypot.trim().length}) — likely autofill/password-manager, not a bot`);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      tenantId: true,
      tenant: { select: { id: true, slug: true, name: true } },
      collectFirstName: true,
      firstNameRequired: true,
      collectLastName: true,
      lastNameRequired: true,
      collectEmail: true,
      emailRequired: true,
      collectMobile: true,
      mobileRequired: true,
      collectProfession: true,
      professionRequired: true,
      professionOptions: true,
      retakePolicy: true,
      retakeDays: true,
      uniqueIdentifier: true,
      paidMode: true,
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not available." };

  const parsed = leadSchema.safeParse(lead);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  }
  const d = parsed.data;

  const firstName = nullifyEmpty(d.firstName);
  const lastName = nullifyEmpty(d.lastName);
  const email = nullifyEmpty(d.email);
  const mobile = nullifyEmpty(d.mobile);
  const profession = nullifyEmpty(d.profession);

  if (assessment.collectFirstName && assessment.firstNameRequired && !firstName)
    return { ok: false, error: "First name is required." };
  if (assessment.collectLastName && assessment.lastNameRequired && !lastName)
    return { ok: false, error: "Last name is required." };
  if (assessment.collectEmail && assessment.emailRequired && !email)
    return { ok: false, error: "Email is required." };
  if (assessment.collectMobile && assessment.mobileRequired && !mobile)
    return { ok: false, error: "Mobile number is required." };
  if (assessment.collectProfession && assessment.professionRequired && !profession)
    return { ok: false, error: "Profession is required." };
  // Membership check: the value must be one of THIS assessment's options (custom
  // list, else the default) — guards a direct POST bypassing the dropdown. An
  // empty/optional value is allowed through above.
  if (profession && !professionOptionsFor(assessment.professionOptions).includes(profession))
    return { ok: false, error: "Please select a valid profession." };

  // Sanitize untrusted attribution from the landing URL (known keys, capped).
  // Fall back to the saved attribution cookie (set in middleware) when this
  // opt-in URL carried none — e.g. the visitor landed with UTMs, then navigated.
  let attr = normalizeAttribution(attribution);
  if (!attr) attr = await readAttributionCookie();
  // Meta match signals for later CAPI attribution (exposed via /api/meta-match).
  // Captured from THIS request: ip/UA headers + the _fbp/_fbc pixel cookies, which
  // the pixel base code sets on page load (before this Start action). fbclidTimestamp
  // anchors fbc reconstruction (fb.1.<ts>.<fbclid>) when the _fbc cookie is absent.
  const metaCtx = await getMetaRequestContext();
  // Bot guard #2 — known crawlers/scrapers (search + AI bots, HTTP libraries) must
  // not create submissions. Real browser UAs never match; a match is a confident bot.
  if (!preview && isCrawlerUserAgent(metaCtx.clientUserAgent)) {
    console.warn(`[start] blocked by CRAWLER-UA (slug=${slug}, ua=${(metaCtx.clientUserAgent ?? "").slice(0, 120)})`);
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  // fbclid_timestamp (unix MILLISECONDS), ALWAYS set: prefer the REAL fbc creation
  // time from the _fbc cookie when the pixel wrote one; else fall back to the opt-in
  // moment. Same unit as Meta's fbc (fb.1.<ms>.<fbclid>) so n8n uses it verbatim.
  // optin_timestamp is exposed separately (= startedAt, ms) on the endpoint.
  const fbclidTimestamp = fbcCreationMs(metaCtx.fbc) ?? Date.now();
  const identifierValue = normalizeIdentifier(assessment.uniqueIdentifier, { email, mobile });
  const leadFields = { firstName, lastName, email, mobile, profession };
  // Mint the customerId once (8 chars; the @unique index is the collision backstop).
  const newCustomerId = generateCustomerId();
  // Unguessable edit token — returned at Start, required to save drafts / complete.
  const newEditToken = generateToken();

  // Admin preview/testing bypasses the lockout — ONLY when the ?preview=1 flag is
  // set AND the caller is the authenticated platform owner (never the flag alone).
  let adminPreview = false;
  if (preview) {
    const u = await getCurrentUser();
    adminPreview = u ? isPlatformOwner(u.email) : false;
  }

  // Extra opt-in field answers — sanitized + capped (untrusted client input).
  const cleanOptin = optinAnswers && typeof optinAnswers === "object"
    ? Object.fromEntries(
        Object.entries(optinAnswers)
          .filter(([, v]) => typeof v === "string" && v.trim())
          .slice(0, 50)
          .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 500)]),
      )
    : {};
  const optinData = Object.keys(cleanOptin).length ? { optinAnswers: cleanOptin as unknown as Prisma.InputJsonValue } : {};

  const submissionData = {
    assessmentId: assessment.id,
    tenantId: assessment.tenantId,
    status: "STARTED" as const,
    leadFirstName: assessment.collectFirstName ? firstName : null,
    leadLastName: assessment.collectLastName ? lastName : null,
    leadEmail: assessment.collectEmail ? email : null,
    leadMobile: assessment.collectMobile ? mobile : null,
    leadProfession: assessment.collectProfession ? profession : null,
    identifierValue,
    editToken: newEditToken,
    clientIp: metaCtx.clientIpAddress,
    userAgent: metaCtx.clientUserAgent,
    fbp: metaCtx.fbp,
    fbc: metaCtx.fbc,
    fbclidTimestamp,
    ...optinData,
    ...(attr ? { attribution: attr as unknown as Prisma.InputJsonValue } : {}),
  };

  // Lockout path — serialize per-(assessment + identifier) with an advisory lock
  // so concurrent submits can't slip two leads through, and a blocked retaker
  // creates NO row / event / webhook. Lockout is scoped to THIS assessment +
  // identifier (completing assessment A never blocks assessment B).
  // State machine: COMPLETED (in window) = hard lock; an in-flight STARTED /
  // ABANDONED row = resume until completed; otherwise create a new submission.
  // (Set retakePolicy=UNLIMITED to allow free retakes; ?preview=1 as owner bypasses.)
  if (!adminPreview && assessment.retakePolicy !== "UNLIMITED" && identifierValue) {
    const policy = assessment.retakePolicy as "DELAYED" | "NEVER";
    // Paid assessments lock on PAYMENT (completedPaidAt), not mere completion —
    // so an unpaid completer can return, resume, edit, and pay. Free assessments
    // lock on completion as before.
    const paidMode = assessment.paidMode;
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`${assessment.id}:${identifierValue}`}, 0))`;
      const last = paidMode
        ? await tx.submission.findFirst({
            where: { assessmentId: assessment.id, identifierValue, completedPaidAt: { not: null } },
            orderBy: { completedPaidAt: "desc" },
            select: { completedPaidAt: true },
          })
        : await tx.submission.findFirst({
            where: { assessmentId: assessment.id, identifierValue, status: "COMPLETED" },
            orderBy: { completedAt: "desc" },
            select: { completedAt: true },
          });
      const lockAt = paidMode
        ? (last as { completedPaidAt: Date | null } | null)?.completedPaidAt ?? null
        : (last as { completedAt: Date | null } | null)?.completedAt ?? null;
      const verdict = evaluateLockout(policy, assessment.retakeDays, lockAt, new Date());
      if (verdict.locked) {
        return { kind: "locked" as const, lastCompletedAt: lockAt, nextAvailableAt: verdict.nextAvailableAt };
      }
      // Resume the latest UNPAID attempt. Paid mode: a STARTED row OR a completed-
      // but-unpaid one (so they edit + pay). Free mode: STARTED only. Refresh the
      // lead snapshot WITHOUT touching status (a completed-unpaid stays completed
      // until they re-submit). Keep the existing customerId.
      const leadUpdate = {
        leadFirstName: submissionData.leadFirstName,
        leadLastName: submissionData.leadLastName,
        leadEmail: submissionData.leadEmail,
        leadMobile: submissionData.leadMobile,
        leadProfession: submissionData.leadProfession,
        ...optinData,
        ...(attr ? { attribution: attr as unknown as Prisma.InputJsonValue } : {}),
      };
      const inflight = await tx.submission.findFirst({
        where: paidMode
          ? { assessmentId: assessment.id, identifierValue, completedPaidAt: null, status: { in: ["STARTED", "COMPLETED"] } }
          : { assessmentId: assessment.id, identifierValue, status: "STARTED" },
        orderBy: { startedAt: "desc" },
        select: { id: true, customerId: true, editToken: true },
      });
      if (inflight) {
        const customerId = inflight.customerId ?? newCustomerId;
        const editToken = inflight.editToken ?? newEditToken; // resume with the same token
        await tx.submission.update({
          where: { id: inflight.id },
          data: {
            ...leadUpdate,
            ...(inflight.customerId ? {} : { customerId }),
            ...(inflight.editToken ? {} : { editToken }),
          },
        });
        return { kind: "reused" as const, submissionId: inflight.id, customerId, editToken };
      }
      const created = await tx.submission.create({
        data: { ...submissionData, customerId: newCustomerId },
        select: { id: true },
      });
      return { kind: "created" as const, submissionId: created.id, customerId: newCustomerId, editToken: newEditToken };
    });

    if (outcome.kind === "locked") {
      return {
        ok: true,
        data: {
          status: "locked",
          policy,
          lastCompletedAt: outcome.lastCompletedAt?.toISOString() ?? null,
          nextAvailableAt: outcome.nextAvailableAt?.toISOString() ?? null,
        },
      };
    }
    let eventId: string | undefined;
    if (outcome.kind === "created") {
      eventId = await fireRegistration(assessment, outcome.submissionId, outcome.customerId, leadFields, attr);
    }
    const answers = outcome.kind === "reused" ? await loadResumeAnswers(outcome.submissionId) : undefined;
    return {
      ok: true,
      data: {
        status: "started",
        submissionId: outcome.submissionId,
        editToken: outcome.editToken,
        ...(eventId ? { eventId } : {}),
        ...(answers && Object.keys(answers).length ? { answers } : {}),
      },
    };
  }

  // No lockout (UNLIMITED / admin / no identifier): create + emit directly.
  const created = await prisma.submission.create({
    data: { ...submissionData, customerId: newCustomerId },
    select: { id: true },
  });
  const eventId = await fireRegistration(assessment, created.id, newCustomerId, leadFields, attr);
  return { ok: true, data: { status: "started", submissionId: created.id, editToken: newEditToken, eventId } };
}

/**
 * "Email my previous results": for a returning (locked-out) respondent, find their
 * latest COMPLETED submission by identifier and emit result.link_requested so the
 * CRM emails the secure result link to the registered address. NEVER reveals the
 * link/score on-screen, and returns the same generic result whether or not a
 * match exists (no enumeration).
 */
export async function requestPreviousResults(
  slug: string,
  lead: LeadInput,
): Promise<ActionResult> {
  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      slug: true,
      title: true,
      targetUrl: true,
      uniqueIdentifier: true,
      tenant: { select: { id: true, slug: true, name: true } },
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not available." };

  const parsed = leadSchema.safeParse(lead);
  if (!parsed.success) return { ok: true }; // generic; never signal validity

  const identifierValue = normalizeIdentifier(assessment.uniqueIdentifier, {
    email: nullifyEmpty(parsed.data.email),
    mobile: nullifyEmpty(parsed.data.mobile),
  });
  if (!identifierValue) return { ok: true };

  const last = await prisma.submission.findFirst({
    where: { assessmentId: assessment.id, identifierValue, status: "COMPLETED" },
    orderBy: { completedAt: "desc" },
    select: {
      id: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      totalScore: true,
      maxScore: true,
      attribution: true,
      resultBand: { select: { level: true, title: true } },
    },
  });

  // Only emit when there is a deliverable email address (the CRM emails the link).
  if (last && last.leadEmail) {
    const total = last.totalScore ?? 0;
    const max = last.maxScore ?? 0;
    const percentage = max > 0 ? Math.round((total / max) * 100) : 0;
    await emitEvent(EventType.RESULT_LINK_REQUESTED, {
      submissionId: last.id,
      tenant: assessment.tenant,
      assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
      lead: {
        firstName: last.leadFirstName,
        lastName: last.leadLastName,
        email: last.leadEmail,
        mobile: last.leadMobile,
      },
      score: { total, max, percentage },
      resultBand: last.resultBand ? { level: last.resultBand.level, title: last.resultBand.title } : null,
      // Send the SAME token-gated respondent link completion sends (targetUrl?t=token),
      // never the admin-only /r/ page. This is what the CRM emails to the client.
      resultUrl: resultUrlFor(assessment.targetUrl, assessment.slug, last.id, last.resultToken),
      attribution: normalizeAttribution(last.attribution) ?? undefined,
    } satisfies EmitInput);
  }

  return { ok: true };
}

/**
 * Complete a submission: validate answers, run the scoring engine, persist
 * answers + category scores + total + matched result band, mark COMPLETED,
 * then fire the CRM automation hook (non-blocking).
 */
export async function completeSubmission(
  submissionId: string,
  input: AnswersInput,
  editToken?: string,
  preResultAnswers?: Record<string, string>,
): Promise<
  ActionResult<{
    submissionId: string;
    // Omitted on PAID exits so the token-bearing VSL url never reaches the client
    // before payment — the verify route reveals it only after a verified payment.
    resultUrl?: string;
    payment?: PaymentCheckout;
    paymentRedirectUrl?: string;
    eventId?: string;
  }>
> {
  const parsed = answersSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid answers." };
  }

  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      id: true,
      status: true,
      editToken: true,
      completedPaidAt: true,
      assessmentId: true,
      tenantId: true,
      attribution: true,
      customerId: true,
      resultToken: true,
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
      leadProfession: true,
      clientIp: true,
      userAgent: true,
      fbp: true,
      fbc: true,
      assessment: { select: { slug: true, targetUrl: true, paidMode: true, paymentUrl: true, paymentAmount: true, aiPromptVersionId: true } },
    },
  });
  if (!submission) return { ok: false, error: "Submission not found." };
  // Ownership: a submission with an edit token requires it (legacy null-token rows
  // are allowed through).
  if (submission.editToken && submission.editToken !== editToken) {
    return { ok: false, error: "Not authorized." };
  }

  // Persist the optional pre-results details (sanitized + capped — untrusted client
  // input). Saved regardless of the completion branch; non-fatal on failure.
  if (preResultAnswers && typeof preResultAnswers === "object") {
    const clean = Object.fromEntries(
      Object.entries(preResultAnswers)
        .filter(([, v]) => typeof v === "string" && v.trim())
        .slice(0, 50)
        .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 500)]),
    );
    if (Object.keys(clean).length) {
      await prisma.submission
        .update({ where: { id: submissionId }, data: { preResultAnswers: clean as unknown as Prisma.InputJsonValue } })
        .catch(() => {});
    }
  }

  // Customer details for the Razorpay payment link (used by all paid paths).
  const customer = {
    name: [submission.leadFirstName, submission.leadLastName].map((s) => s?.trim() ?? "").filter(Boolean).join(" ") || null,
    email: submission.leadEmail,
    phone: submission.leadMobile,
  };

  // Already completed: a PAID one (or any free-mode one) returns its existing
  // result/checkout. A paid-mode completion that is NOT yet paid is re-doable
  // (edit until pay): reset it to STARTED so the scoring flow below re-runs.
  const returnCompleted = async () => {
    const resultUrl = buildResultUrl(submission.assessment.targetUrl, submission.assessment.slug, submissionId, submission.resultToken);
    const paid = await resolvePaidCheckout({
      tenantId: submission.tenantId,
      paidMode: submission.assessment.paidMode,
      paymentUrl: submission.assessment.paymentUrl,
      paymentAmount: submission.assessment.paymentAmount,
      submissionId,
      token: submission.resultToken,
      customer,
    });
    const paidExit = !!(paid.payment || paid.paymentRedirectUrl);
    return { ok: true as const, data: { submissionId, ...(paidExit ? {} : { resultUrl }), ...paid } };
  };
  if (submission.status === "COMPLETED") {
    if (submission.completedPaidAt || !submission.assessment.paidMode) {
      return returnCompleted(); // paid (or free) — locked, no redo
    }
    // Payment table is the source of truth (a capture may be recorded before
    // completedPaidAt is set): if paid, never re-score — return the existing result.
    const paidRow = await prisma.payment.findFirst({
      where: { submissionId, purpose: "assessment_unlock", status: "captured" },
      select: { id: true },
    });
    if (paidRow) return returnCompleted();
    // Unpaid paid-mode re-completion: reset to STARTED (clear the unpaid guard) so
    // the normal STARTED->COMPLETED scoring re-runs. If it got paid meanwhile, the
    // CAS misses and we return the existing result instead of re-scoring.
    const reset = await prisma.submission.updateMany({
      where: { id: submissionId, status: "COMPLETED", completedPaidAt: null },
      data: { status: "STARTED", completedUnpaidAt: null },
    });
    if (reset.count === 0) return returnCompleted();
  }

  const assessment = await prisma.assessment.findUnique({
    where: { id: submission.assessmentId },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      targetUrl: true,
      tokenTtlSeconds: true,
      paidMode: true,
      paymentUrl: true,
      paymentAmount: true,
      useAiStatement: true,
      nextStep: true,
      engine: true,
      engineConfig: true,
      tenant: { select: { id: true, slug: true, name: true } },
      categories: {
        select: {
          id: true,
          name: true,
          page: true,
          questions: {
            select: {
              id: true,
              text: true,
              weight: true,
              required: true,
              scoringRole: true,
              options: { select: { id: true, value: true, label: true, diagnosisClause: true, isAssumption: true } },
            },
          },
          bands: {
            select: { id: true, label: true, meaning: true, minScore: true, maxScore: true, displayOrder: true },
          },
        },
      },
      resultBands: {
        select: { id: true, level: true, title: true, description: true, minScore: true, maxScore: true, displayOrder: true },
      },
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not found." };
  // Re-check publication: an admin may have unpublished it mid-flight, in which
  // case we must not score or emit a lead to the CRM.
  if (assessment.status !== "PUBLISHED") {
    return { ok: false, error: "This assessment is no longer available." };
  }

  // Index questions and options for validation + scoring.
  const questions = assessment.categories.flatMap((c) =>
    c.questions.map((q) => ({ ...q, categoryId: c.id })),
  );
  const questionById = new Map(questions.map((q) => [q.id, q]));

  // Build answer value map (last answer per question wins).
  const answerValueByQuestionId = new Map<string, number>();
  const optionByQuestionId = new Map<string, string>();
  for (const a of parsed.data.answers) {
    const q = questionById.get(a.questionId);
    if (!q) return { ok: false, error: "Answer references an unknown question." };
    const option = q.options.find((o) => o.id === a.optionId);
    if (!option) return { ok: false, error: "Answer references an invalid option." };
    answerValueByQuestionId.set(a.questionId, option.value);
    optionByQuestionId.set(a.questionId, option.id);
  }

  // Enforce required questions.
  const missingRequired = questions.filter(
    (q) => q.required && !answerValueByQuestionId.has(q.id),
  );
  if (missingRequired.length > 0) {
    return {
      ok: false,
      error: `Please answer all required questions (${missingRequired.length} remaining).`,
    };
  }

  // Score.
  const scoringQuestions: ScoringQuestion[] = questions.map((q) => ({
    id: q.id,
    categoryId: q.categoryId,
    weight: q.weight,
    maxValue: q.options.reduce((m, o) => Math.max(m, o.value), 0),
  }));
  const { categoryScores, totalScore, maxScore, percentage } = computeScores(
    scoringQuestions,
    answerValueByQuestionId,
  );
  // Bands are matched against the percentage (invariant to skipped optional Qs).
  const band = pickResultBand(assessment.resultBands, percentage);

  // Per-category band mapping (reuses the generic pickResultBand).
  const categoryById = new Map(assessment.categories.map((c) => [c.id, c]));
  const categoryResults: PayloadCategory[] = categoryScores.map((cs) => {
    const cat = categoryById.get(cs.categoryId);
    return mapCategoryResult(cat?.name ?? "", cs.score, cs.maxScore, cat?.bands ?? []);
  });

  // Per-question detail (question text + the option they chose + weighted score),
  // grouped by category, so the AI can derive MEANING rather than reword totals.
  // The snapshot/webhook category shape (categoryResults) is left unchanged.
  const answerForBreakdown = new Map<string, ChosenAnswer>();
  for (const [qid, value] of answerValueByQuestionId) {
    answerForBreakdown.set(qid, { value, optionId: optionByQuestionId.get(qid) as string });
  }
  const questionsByCategory = new Map(
    buildCategoryQuestionBreakdown(assessment.categories, answerForBreakdown).map((b) => [
      b.name,
      b.questions,
    ]),
  );
  const aiCategories = categoryResults.map((c) => ({
    ...c,
    questions: questionsByCategory.get(c.name) ?? [],
  }));

  // Opaque public ids + denormalized read-endpoint snapshot + destination URL.
  const customerId = submission.customerId ?? generateCustomerId();
  // Preserve the existing result token across a re-completion so links already
  // issued (emailed nudge / static pay link) keep working; mint one only if none.
  const token = submission.resultToken ?? generateToken();
  const ttl = assessment.tokenTtlSeconds ?? DEFAULT_RESULT_TOKEN_TTL_SECONDS;
  const expiresAt = new Date(Date.now() + ttl * 1000);
  // Guard the billable, multi-second AI call: if a concurrent writer already
  // completed this submission (it passed the COMPLETED check at the top but won
  // the race during scoring), return their result instead of generating again.
  const recheck = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: { status: true, resultToken: true },
  });
  if (recheck?.status === "COMPLETED") {
    const paid = await resolvePaidCheckout({
      tenantId: assessment.tenant?.id ?? null,
      paidMode: assessment.paidMode,
      paymentUrl: assessment.paymentUrl,
      paymentAmount: assessment.paymentAmount,
      submissionId,
      token: recheck.resultToken,
      customer,
    });
    const paidExit = !!(paid.payment || paid.paymentRedirectUrl);
    const resultUrl = buildResultUrl(
      assessment.nextStep === "RESULTS" ? null : assessment.targetUrl,
      assessment.slug,
      submissionId,
      recheck.resultToken,
    );
    return {
      ok: true,
      data: { submissionId, ...(paidExit ? {} : { resultUrl }), ...paid },
    };
  }

  // Clinic-audit engine: compute the funnel result from the answers' roles + option
  // numbers (pure, deterministic), then generate the fixed 4-section Divine Leads
  // prose over the ALREADY-COMPUTED figures. The generic scoring above still ran
  // (harmless totals) so webhooks/analytics keep their shape; the result page renders
  // from the clinic snapshot. Both AI paths are fail-soft (null on off/slow/error).
  let clinicSnap: ClinicSnapshot | null = null;
  let clinicBandName: string | null = null;
  let aiStatement: string | null = null;

  if (assessment.engine === "CLINIC_AUDIT") {
    const config = resolveEngineConfig(assessment.engineConfig);
    const rawAnswers: RawAnswer[] = [];
    for (const a of parsed.data.answers) {
      const q = questionById.get(a.questionId);
      if (!q || !isClinicRole(q.scoringRole ?? "")) continue;
      const opt = q.options.find((o) => o.id === a.optionId);
      if (!opt) continue;
      rawAnswers.push({
        role: q.scoringRole as ClinicRole,
        value: opt.value,
        isAssumption: opt.isAssumption,
        clause: opt.diagnosisClause,
      });
    }
    const inputs = deriveInputs(rawAnswers, config);
    const result = computeResult(inputs, config);
    clinicBandName = result.band;
    if (assessment.useAiStatement) {
      const ctx = buildClinicPromptContext(result, questions, optionByQuestionId, submission.leadProfession);
      aiStatement = await generateClinicStatement(buildClinicContext(ctx), submission.tenantId);
    }
    clinicSnap = { inputs, config, prose: aiStatement };
  } else {
    // GENERIC: the personalized statement over the overall + per-category bands.
    aiStatement = assessment.useAiStatement
      ? await generatePersonalStatement({
          firstName: submission.leadFirstName,
          profession: submission.leadProfession,
          assessmentTitle: assessment.title,
          scoreRaw: totalScore,
          max: maxScore,
          percentage: Math.round(percentage),
          band: band?.title ?? null,
          bandLevel: band?.level ?? null,
          categories: aiCategories,
        }, submission.tenantId, submission.assessment.aiPromptVersionId)
      : null;
  }
  // "Show results on assess360" (nextStep RESULTS): never redirect to an external VSL —
  // force our own internal result page.
  const vslTarget = assessment.nextStep === "RESULTS" ? null : assessment.targetUrl;

  const snapshot = buildResultSnapshot({
    customerId,
    scoreRaw: totalScore,
    max: maxScore,
    scorePercent: Math.round(percentage),
    resultBand: clinicBandName ?? band?.title ?? null,
    resultBandLevel: band?.level ?? null,
    resultSuggestion: band?.description ?? null,
    aiStatement,
    categories: categoryResults,
    clinic: clinicSnap ?? undefined,
  });
  const resultUrl = buildResultUrl(vslTarget, assessment.slug, submissionId, token);

  // Persist atomically. The final statement is a compare-and-swap on status:
  // only a writer that flips STARTED -> COMPLETED "wins". This makes scoring
  // persistence and the CRM dispatch exactly-once under concurrent double-submits.
  const tx = await prisma.$transaction([
    prisma.submissionAnswer.deleteMany({ where: { submissionId } }),
    prisma.submissionCategoryScore.deleteMany({ where: { submissionId } }),
    prisma.submissionAnswer.createMany({
      data: Array.from(answerValueByQuestionId.entries()).map(
        ([questionId, value]) => ({
          submissionId,
          questionId,
          optionId: optionByQuestionId.get(questionId) as string,
          value,
        }),
      ),
    }),
    prisma.submissionCategoryScore.createMany({
      data: categoryScores.map((cs) => ({
        submissionId,
        categoryId: cs.categoryId,
        score: cs.score,
        maxScore: cs.maxScore,
      })),
    }),
    prisma.submission.updateMany({
      where: { id: submissionId, status: "STARTED" },
      data: {
        status: "COMPLETED",
        totalScore,
        maxScore,
        resultBandId: band?.id ?? null,
        completedAt: new Date(),
        resultToken: token,
        resultTokenExpiresAt: expiresAt,
        resultSnapshot: snapshot as unknown as Prisma.InputJsonValue,
        aiStatement,
        ...(submission.customerId ? {} : { customerId }),
      },
    }),
  ]);

  // If a concurrent writer already completed this submission, do not re-fire CRM;
  // return that writer's destination URL.
  const swap = tx[tx.length - 1] as { count: number } | undefined;
  if (!swap || swap.count === 0) {
    const existing = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { resultToken: true },
    });
    const paid = await resolvePaidCheckout({
      tenantId: assessment.tenant?.id ?? null,
      paidMode: assessment.paidMode,
      paymentUrl: assessment.paymentUrl,
      paymentAmount: assessment.paymentAmount,
      submissionId,
      token: existing?.resultToken ?? null,
      customer,
    });
    const paidExit = !!(paid.payment || paid.paymentRedirectUrl);
    const resultUrl = buildResultUrl(vslTarget, assessment.slug, submissionId, existing?.resultToken ?? null);
    return {
      ok: true,
      data: { submissionId, ...(paidExit ? {} : { resultUrl }), ...paid },
    };
  }

  // Emit assessment.completed. EventLog is always written; webhook delivery
  // (incl. the CRM endpoint) is non-blocking and never fails this flow. Run only
  // for the winning writer (exactly-once).
  //
  // NOTE: result.generated is intentionally NOT emitted — scoring is synchronous,
  // so it would be a duplicate of assessment.completed (same instant, same data)
  // and create duplicate CRM records. See ACTIVE_EVENT_TYPES in events/types.ts.
  const full = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      leadFirstName: true,
      leadLastName: true,
      leadEmail: true,
      leadMobile: true,
    },
  });

  // Completion without an in-app payment is ONE event: completed_unpaid. Paid mode
  // fires completed_paid (on payment) + completed_unpaid (30-min sweep); free mode
  // fires completed_unpaid immediately here. (Legacy: this used to emit the separate
  // assessment.completed for free mode — unified so every "completed, not purchased"
  // lead lands on the same CRM webhook regardless of paid/free.)
  if (!assessment.paidMode) {
    await emitEvent(EventType.ASSESSMENT_COMPLETED_UNPAID, {
      submissionId,
      customerId,
      tenant: assessment.tenant,
      assessment: { id: assessment.id, slug: assessment.slug, title: assessment.title },
      lead: {
        firstName: full?.leadFirstName ?? null,
        lastName: full?.leadLastName ?? null,
        email: full?.leadEmail ?? null,
        mobile: full?.leadMobile ?? null,
      },
      score: { total: totalScore, max: maxScore, percentage },
      resultBand: band ? { level: band.level, title: band.title } : null,
      categories: categoryResults,
      resultUrl,
      aiStatement,
      attribution: normalizeAttribution(submission.attribution) ?? undefined,
    } satisfies EmitInput);
  }

  // Server-side Meta CAPI (AssessmentCompleted). Runs ONLY for the winning
  // writer (exactly-once); the returned eventId dedups the browser pixel.
  // Inert unless configured; fail-soft context; non-blocking send.
  const eventId = randomUUID();
  if (await isCapiConfigured(assessment.tenant?.id ?? null)) {
    const ctx = await getMetaRequestContext();
    void sendCapiEvent({
      eventName: "AssessmentCompleted",
      eventId,
      eventTimeMs: Date.now(),
      eventSourceUrl: `${env.NEXT_PUBLIC_APP_URL}/a/${assessment.slug}`,
      user: {
        email: full?.leadEmail ?? null,
        phone: full?.leadMobile ?? null,
        firstName: full?.leadFirstName ?? null,
        lastName: full?.leadLastName ?? null,
        ...ctx,
      },
      customData: { content_name: assessment.title, assessment_name: assessment.title },
    }, assessment.tenant?.id ?? null).catch(() => {});
  }

  // Backfill Meta match signals if the Start capture missed them (e.g. the _fbp
  // cookie was written after Start). Best-effort; never delays or fails completion.
  try {
    const mctx = await getMetaRequestContext();
    const patch: Prisma.SubmissionUpdateManyMutationInput = {};
    if (!submission.clientIp && mctx.clientIpAddress) patch.clientIp = mctx.clientIpAddress;
    if (!submission.userAgent && mctx.clientUserAgent) patch.userAgent = mctx.clientUserAgent;
    if (!submission.fbp && mctx.fbp) patch.fbp = mctx.fbp;
    if (!submission.fbc && mctx.fbc) patch.fbc = mctx.fbc;
    if (Object.keys(patch).length > 0) {
      await prisma.submission.updateMany({ where: { id: submissionId }, data: patch });
    }
  } catch {
    /* non-critical enrichment — ignore */
  }

  const paid = await resolvePaidCheckout({
    tenantId: assessment.tenant?.id ?? null,
    paidMode: assessment.paidMode,
    paymentUrl: assessment.paymentUrl,
    paymentAmount: assessment.paymentAmount,
    submissionId,
    token,
    customer,
  });
  // On a PAID exit, omit the token-bearing resultUrl from the client response.
  const paidExit = !!(paid.payment || paid.paymentRedirectUrl);
  return { ok: true, data: { submissionId, ...(paidExit ? {} : { resultUrl }), ...paid, eventId } };
}

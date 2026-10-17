"use server";

import { cookies } from "next/headers";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { generateCustomerId, generateToken } from "@/lib/ids";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeAttribution } from "@/lib/events/payload";
import { ATTR_COOKIE } from "@/lib/attribution";
import { isCrawlerUserAgent } from "@/lib/bots";
import { getMetaRequestContext } from "@/lib/meta/request-context";
import { isValidEmail, normalizeEmail, EMAIL_ERROR } from "@/lib/lead-format";
import { evaluateLockout } from "@/features/assessment/lockout";
import { gateTotals, gateBandOf } from "@/features/assessment/gate-verdict";
import { qualificationSchema, professionOptionsFor } from "@/features/assessment/schemas";
import { splitIsActive, type LeadSplitInput } from "@/features/assessment/flow/lead-split";
import { audienceGateRenders } from "@/features/assessment/audience-gate";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type SplitLeadResult } from "@/features/assessment/flow/lead-split-io";

/**
 * SPLIT lead capture: write the lead the moment the email arrives.
 *
 * This is the whole point of the mode. The respondent has cleared the gate and typed
 * an email, and the next fifteen minutes are twenty-one statements they may well not
 * finish. Today that person leaves nothing behind. After this they leave a name, an
 * email and the gate answers that say why they were worth talking to.
 *
 * 🔴 WHAT THIS DELIBERATELY DOES NOT DO.
 *
 * It creates no Submission. The row lives on GateEntry until the phone screen, which
 * keeps the two menus meaning one thing each - Gate qualified is "gave an email",
 * Submissions is "registered" - so the same person is never counted twice in the lead
 * numbers the ad spend is judged against.
 *
 * It sends Meta nothing. GateQualified already fired when the gate cleared, and
 * CompleteRegistration belongs on the LAST lead field, which is the phone screen. An
 * event here would report a lead whose phone number does not exist yet.
 *
 * It never sees the name before this call. The name screen renders before the gate,
 * and what is typed there is held in the browser and posted HERE, after the verdict.
 * So somebody the gate rejects leaves no name, no row and nothing that could be
 * mistaken for a lead - the promise the gate exists to make, kept in code rather than
 * in a warning the author can click past.
 */
export async function captureSplitLead(
  slug: string,
  payload: {
    visitorId: string;
    firstName?: string;
    lastName?: string;
    profession?: string;
    email: string;
    audienceRole?: string;
    optinAnswers?: Record<string, string>;
    qualAnswers?: Record<string, string>;
    qualChoices?: Record<string, string>;
    honeypot?: string;
    attribution?: Record<string, string>;
  },
): Promise<ActionResult<SplitLeadResult>> {
  // Bot guard #1 - the hidden field no human fills. Same generic refusal the opt-in
  // gives, so a bot learns nothing from the difference.
  if (payload.honeypot && payload.honeypot.trim()) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  const vid = (payload.visitorId ?? "").trim().slice(0, 64);
  if (!vid) return { ok: false, error: "Something went wrong. Please try again." };
  if (!rateLimit("splitlead:global", 5000)) {
    return { ok: false, error: "Too many requests. Please try again in a moment." };
  }
  if (!rateLimit(`splitlead:vid:${vid}`, 10)) {
    return { ok: false, error: "Too many requests. Please try again in a moment." };
  }

  const assessment = await prisma.assessment.findFirst({
    where: { slug, status: "PUBLISHED" },
    select: {
      id: true,
      tenantId: true,
      leadCaptureMode: true,
      collectFirstName: true,
      collectLastName: true,
      collectEmail: true,
      collectMobile: true,
      collectProfession: true,
      professionOptions: true,
      audienceGate: true,
      optinFields: true,
      preResultFields: true,
      qualification: true,
      retakePolicy: true,
      retakeDays: true,
      uniqueIdentifier: true,
      paidMode: true,
    },
  });
  if (!assessment) return { ok: false, error: "Assessment not available." };

  // Structural check, not a preference: this route only exists for a SPLIT funnel that
  // actually collects an email. Anything else means a row edited around the builder's
  // own save rule, and the right answer is to refuse rather than to write a lead the
  // rest of the system has no route for.
  const hasAudienceGate = audienceGateRenders(assessment.audienceGate);
  const splitInput: LeadSplitInput = {
    splitMode: assessment.leadCaptureMode === "SPLIT",
    collectFirstName: assessment.collectFirstName,
    collectLastName: assessment.collectLastName,
    collectEmail: assessment.collectEmail,
    collectMobile: assessment.collectMobile,
    collectProfession: assessment.collectProfession,
    audienceGate: hasAudienceGate,
    qualificationLive: false, // not needed for the active check
    scoredQuestions: 0,
    optinFieldCount: 0,
    preResultFieldCount: 0,
  };
  if (!splitIsActive(splitInput)) {
    return { ok: false, error: "Assessment not available." };
  }

  const metaCtx = await getMetaRequestContext();
  // Bot guard #2 - a known crawler must never create a lead row.
  if (isCrawlerUserAgent(metaCtx.clientUserAgent)) {
    return { ok: false, error: "Something went wrong. Please try again." };
  }

  // The email is the one field this screen exists for, so it is checked here rather
  // than trusted from the browser, which may have been bypassed entirely.
  const email = normalizeEmail(payload.email);
  if (!isValidEmail(email)) return { ok: false, error: EMAIL_ERROR };

  // In SPLIT every collected field is mandatory - that is the mode's contract, and the
  // builder hides the Required toggles to say so. Enforced here too, because the only
  // place a rule is real is the server.
  const firstName = (payload.firstName ?? "").trim().slice(0, 120);
  const lastName = (payload.lastName ?? "").trim().slice(0, 120);
  if (assessment.collectFirstName && !firstName) {
    return { ok: false, error: "Please enter your first name." };
  }
  if (assessment.collectLastName && !lastName) {
    return { ok: false, error: "Please enter your last name." };
  }

  // Profession rides with the name screen, and only when no audience gate already
  // asked the same question.
  let profession: string | null = null;
  if (assessment.collectProfession && !hasAudienceGate) {
    const typed = (payload.profession ?? "").trim().slice(0, 120);
    const allowed = professionOptionsFor(assessment.professionOptions);
    // Validated against the assessment's OWN list: this value is mapped straight to
    // the CRM, so it is not something the browser gets to invent.
    profession = allowed.includes(typed) ? typed : null;
    if (!profession) return { ok: false, error: "Please choose an option to continue." };
  }

  const cleanRole =
    typeof payload.audienceRole === "string" && payload.audienceRole.trim()
      ? payload.audienceRole.trim().slice(0, 120)
      : null;

  // -------------------------------------------------------------------------
  // The retake lock, run HERE rather than at the end.
  //
  // In single-screen mode the lock cannot run until the opt-in, which on a
  // lead-capture-after funnel is after the whole assessment: somebody already locked
  // out answers twenty-one statements before being told. Keyed on EMAIL, this mode
  // knows the identifier the moment the gate clears, so they are turned away in the
  // right place. Keyed on MOBILE there is still nothing to check yet, and the lock
  // runs at the phone screen inside startSubmission exactly as it does today.
  // -------------------------------------------------------------------------
  const identifierValue = assessment.uniqueIdentifier === "EMAIL" ? email : null;
  if (identifierValue && assessment.retakePolicy !== "UNLIMITED") {
    const policy = assessment.retakePolicy as "DELAYED" | "NEVER";
    const last = assessment.paidMode
      ? await prisma.submission.findFirst({
          where: { assessmentId: assessment.id, identifierValue, completedPaidAt: { not: null } },
          orderBy: { completedPaidAt: "desc" },
          select: { completedPaidAt: true, resultToken: true, leadEmail: true },
        })
      : await prisma.submission.findFirst({
          where: { assessmentId: assessment.id, identifierValue, status: "COMPLETED" },
          orderBy: { completedAt: "desc" },
          select: { completedAt: true, resultToken: true, leadEmail: true },
        });
    const lockAt = assessment.paidMode
      ? (last as { completedPaidAt: Date | null } | null)?.completedPaidAt ?? null
      : (last as { completedAt: Date | null } | null)?.completedAt ?? null;
    const verdict = evaluateLockout(policy, assessment.retakeDays, lockAt, new Date());
    if (verdict.locked) {
      // No row is written for a locked retaker, exactly as the opt-in writes none.
      return {
        ok: true,
        data: {
          status: "locked",
          policy,
          lastCompletedAt: lockAt ? lockAt.toISOString() : null,
          nextAvailableAt: verdict.nextAvailableAt ? verdict.nextAvailableAt.toISOString() : null,
          resultAvailable: Boolean(last?.resultToken && last?.leadEmail),
        },
      };
    }
  }

  // Gate answers, resolved against the STORED gate rather than taken from the browser,
  // so the row and the routing cannot disagree about what the gate awarded. Same
  // helper both server paths already share.
  const gate = qualificationSchema.safeParse(assessment.qualification);
  const totals = gateTotals(
    gate.success ? gate.data : null,
    payload.qualChoices && typeof payload.qualChoices === "object" ? payload.qualChoices : null,
  );
  const cleanQualText =
    payload.qualAnswers && typeof payload.qualAnswers === "object"
      ? Object.fromEntries(
          Object.entries(payload.qualAnswers)
            .filter(([, v]) => typeof v === "string" && v.trim())
            .slice(0, 30)
            .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 1000)]),
        )
      : {};
  const cleanChoices = Object.fromEntries(
    Object.entries(totals.picks).map(([k, v]) => [k, v.slice(0, 1000)]),
  );
  const storedQual = { ...cleanQualText, ...cleanChoices };
  const gateRows = totals.rows.map((r) => ({
    q: r.q.slice(0, 1000),
    a: r.a.slice(0, 1000),
    points: r.points,
    max: r.max,
  }));

  // Custom opt-in fields ride with the email screen - sanitized and capped, same
  // shape and limits the opt-in uses.
  const cleanOptin =
    payload.optinAnswers && typeof payload.optinAnswers === "object"
      ? Object.fromEntries(
          Object.entries(payload.optinAnswers)
            .filter(([, v]) => typeof v === "string" && v.trim())
            .slice(0, 50)
            .map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 500)]),
        )
      : {};

  let attr = normalizeAttribution(payload.attribution);
  if (!attr) {
    const raw = (await cookies()).get(ATTR_COOKIE)?.value;
    if (raw) {
      try {
        attr = normalizeAttribution(JSON.parse(raw));
      } catch {
        // a malformed cookie is not worth failing a lead over
      }
    }
  }

  // The cid is minted HERE, not when the gate screen opened.
  //
  // It is the join key between this row and the Submission that follows, so it has to
  // exist for every lead and be the same one in both places. Minting it at gate pass
  // looked closer to "allocated when the gate starts", but that path is fail-soft and
  // is skipped entirely when a funnel has no gate or has Meta switched off, which
  // would leave leads with no cid. One mint site that always runs beats two that
  // sometimes do. Reused on a re-entry, so a returning visitor keeps their id.
  const existing = await prisma.gateEntry.findUnique({
    where: { assessmentId_visitorId: { assessmentId: assessment.id, visitorId: vid } },
    select: { id: true, customerId: true, leadToken: true, submissionId: true },
  });

  // Already registered on this visit: the lead is the Submission's now, and letting
  // this overwrite the row would reopen a finished run.
  if (existing?.submissionId) {
    return { ok: false, error: "This assessment has already been submitted." };
  }

  const customerId = existing?.customerId ?? generateCustomerId();
  const leadToken = existing?.leadToken ?? generateToken();

  const lead = {
    tenantId: assessment.tenantId,
    customerId,
    leadToken,
    leadFirstName: assessment.collectFirstName ? firstName : null,
    leadLastName: assessment.collectLastName ? lastName : null,
    leadEmail: email,
    // Mirrored the way the Submission does it: on a gated funnel the audience role
    // stands in for profession, so the CRM mapping is fed either way.
    leadProfession: cleanRole ?? profession,
    audienceRole: cleanRole,
    emailCapturedAt: new Date(),
    identifierValue,
    gateScore: totals.max > 0 ? totals.score : null,
    gateMax: totals.max > 0 ? totals.max : null,
    gateBand: gateBandOf(gate.success ? gate.data : null, totals.score, totals.max),
    ...(gateRows.length ? { gateBreakdown: gateRows as unknown as Prisma.InputJsonValue } : {}),
    ...(Object.keys(storedQual).length
      ? { qualificationAnswers: storedQual as unknown as Prisma.InputJsonValue }
      : {}),
    ...(Object.keys(cleanOptin).length
      ? { optinAnswers: cleanOptin as unknown as Prisma.InputJsonValue }
      : {}),
  };

  const signals = {
    clientIp: metaCtx.clientIpAddress,
    userAgent: metaCtx.clientUserAgent,
    fbp: metaCtx.fbp,
    fbc: metaCtx.fbc,
    country: metaCtx.country,
    city: metaCtx.city,
    region: metaCtx.region,
    postalCode: metaCtx.postalCode,
    ...(attr ? { attribution: attr as unknown as Prisma.InputJsonValue } : {}),
  };

  // Upserted on (assessment, visitor), the key this table already uses, so a refresh
  // or a second attempt updates the one row instead of queueing a second abandonment
  // for the same person.
  await prisma.gateEntry.upsert({
    where: { assessmentId_visitorId: { assessmentId: assessment.id, visitorId: vid } },
    update: { ...signals, ...lead },
    create: { assessmentId: assessment.id, visitorId: vid, ...signals, ...lead },
  });

  return { ok: true, data: { status: "captured", customerId, leadToken } };
}

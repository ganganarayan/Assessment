"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { resolveActingScope } from "@/lib/tenant/acting";
import { isBusinessTenant } from "@/lib/tenant/platform-tenant";
import { resolveMetaConfig } from "@/lib/settings/config";
import { sendSmtpTest } from "@/features/nurture/actions";
import { importTemplate } from "@/features/templates/actions/library";
import { getOnboardingView, type OnboardingView } from "@/features/onboarding/data";
import { persistStep } from "@/features/onboarding/save";
import { STEP_BY_KEY, schemaFor } from "@/features/onboarding/steps";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { tenantScope } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { publicOriginFor } from "@/lib/tenant/public-origin";
import { adLinkFor } from "@/lib/meta/url-parameters";
import {
  qualificationSchema,
  EMPTY_QUALIFICATION,
  isQualificationActive,
  readExits,
  resolveExit,
  optionOutcome,
  isWaitlistExitKey,
} from "@/features/assessment/schemas";
import { evaluateAdReadiness, type ReadinessLine } from "@/features/onboarding/ad-readiness";

/**
 * The guided setup, one answer at a time.
 *
 * Every one of these returns the WHOLE recomputed view, which is what makes the dialog
 * self-advancing without a second round trip and without the client keeping its own idea
 * of where it is. The server decides what the next question is, every time, from the
 * journal and the facts - so an answer that satisfies two steps at once, or one that
 * opens a branch, lands the person on the right screen rather than on the next index.
 *
 * Nothing here is a wall. A skip is recorded, a failed check can be retried or left, and
 * closing the dialog loses nothing: the next sign-in resumes on the same question.
 */

/** Save one answer and return where that leaves them. */
export async function answerOnboardingStep(
  key: string,
  value: string,
): Promise<ActionResult<OnboardingView & { message?: string }>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const step = STEP_BY_KEY[key];
  if (!step) return { ok: false, error: "That is not a step in the sequence." };
  if (step.kind === "check" || step.kind === "handoff") {
    return { ok: false, error: "That step is not answered by typing." };
  }

  const parsed = schemaFor(step).safeParse(value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That value cannot be used." };
  }
  const clean = parsed.data;

  // Its real home first. A journal row written for a save that failed would tell the
  // next load the step is done while the setting it stands for is still empty.
  const saved = await persistStep({ tenantId, userId: user.id, key, value: clean });
  if (!saved.ok) return saved;

  await journal(tenantId, key, step.kind === "secret" ? null : clean);
  const next = await view(tenantId, user.id);
  // The receipt rides back WITH the new view rather than in a channel of its own, so
  // the dialog cannot show a note about a save whose state it failed to adopt.
  if (next.ok && next.data && saved.note) return { ok: true, data: { ...next.data, message: saved.note } };
  return next;
}

/** "I will do this later". Recorded, so the sequence stops asking and the step is still
 *  listed as outstanding. */
export async function skipOnboardingStep(key: string): Promise<ActionResult<OnboardingView>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const step = STEP_BY_KEY[key];
  if (!step) return { ok: false, error: "That is not a step in the sequence." };
  // Only where the sequence offered it. The required steps are the ones a funnel cannot
  // run without, and a client that asks to skip one is asking for a workspace that
  // looks set up and is not.
  if (!step.skippable) return { ok: false, error: "This one is needed before your funnel can run." };

  await prisma.onboardingAnswer.upsert({
    where: { tenantId_stepKey: { tenantId, stepKey: key } },
    update: { value: null, skipped: true },
    create: { tenantId, stepKey: key, value: null, skipped: true },
  });
  return view(tenantId, user.id);
}

/**
 * Run the check a step stands for and say what happened.
 *
 * 🟡 A FAILING CHECK IS NOT RECORDED. Only a pass writes the row, so the sequence holds
 * them on this question instead of walking them past a sender that cannot send. They are
 * never stuck: the dialog offers the step again, and "later" is still a skip.
 */
export async function runOnboardingCheck(key: string): Promise<ActionResult<{ view: OnboardingView; pass: boolean; message: string }>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  let pass = false;
  let message = "";

  if (key === "metaCheck") {
    const meta = await resolveMetaConfig(tenantId);
    pass = !!(meta.pixelId && meta.capiToken);
    message = pass
      ? `Pixel ${meta.pixelId} is live and the Conversions API token is stored. Your funnel can report a qualified lead.`
      : meta.pixelId
      ? "The pixel is saved but there is no Conversions API token, so nothing is reported server side. That is the half nobody notices is missing."
      : "No pixel is resolving for this workspace yet.";
  } else if (key === "emailCheck") {
    const to = (user.email ?? "").trim();
    if (!to) {
      return { ok: false, error: "Your login has no email address to send a test to." };
    }
    const r = await sendSmtpTest(to);
    pass = r.ok;
    message = r.ok
      ? `Sent to ${to}. If it is not there in a minute, check the spam folder before changing anything.`
      : r.error;
  } else {
    return { ok: false, error: "That step is not a check." };
  }

  if (pass) await journal(tenantId, key, "ok");
  return { ok: true, data: { view: await viewOf(tenantId, user.id), pass, message } };
}

/**
 * The hand-off: import a template and leave for the builder.
 *
 * The plan cap, the parked check and the ownership of the new assessment are all the
 * existing import action's job, so the sequence cannot become a way around any of them.
 */
export async function importStarterTemplate(
  templateId: string,
  /** RESULTS or VSL, as chosen two steps earlier. Anything else brings both pages. */
  resultPageKind?: string,
): Promise<ActionResult<{ assessmentId: string }>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const kind = resultPageKind === "RESULTS" || resultPageKind === "VSL" ? resultPageKind : null;
  const r = await importTemplate(templateId, kind);
  if (!r.ok) return r;
  if (!r.data) return { ok: false, error: "The template imported but returned nothing to open." };

  await journal(tenantId, "starterTemplate", r.data.slug);
  revalidatePath("/w/dashboard");
  return { ok: true, data: { assessmentId: r.data.assessmentId } };
}

/** Record that a step was answered. The VALUE is only ever a fact with no other home,
 *  or a marker - never a credential. */
async function journal(tenantId: string, stepKey: string, value: string | null): Promise<void> {
  await prisma.onboardingAnswer.upsert({
    where: { tenantId_stepKey: { tenantId, stepKey } },
    update: { value, skipped: false },
    create: { tenantId, stepKey, value, skipped: false },
  });
}

async function viewOf(tenantId: string, userId: string): Promise<OnboardingView> {
  const v = await getOnboardingView(tenantId, userId);
  if (!v) throw new Error("This workspace is not in the setup sequence.");
  return v;
}

async function view(tenantId: string, userId: string): Promise<ActionResult<OnboardingView>> {
  const v = await getOnboardingView(tenantId, userId);
  if (!v) return { ok: false, error: "This workspace is not in the setup sequence." };
  // The dashboard carries the resume line and the derived progress panel, both of which
  // are now one answer out of date.
  revalidatePath("/w/dashboard");
  return { ok: true, data: v };
}

/**
 * The ad link has been taken, recorded from the BUILDER's publish dialog.
 *
 * Publishing a funnel pops up both links, and that dialog is the one interruption worth
 * making at that moment - so the setup sequence must not open a second one behind it
 * saying the same thing. Acknowledging there is therefore the same acknowledgement as
 * answering the sequence's own step, and this is what joins the two.
 *
 * 🔴 NEVER requireWorkspace HERE. The same dialog appears on /admin, where a super admin
 * who has not entered a workspace would be REDIRECTED by that guard - and a redirect
 * thrown out of an OK button is a dialog that cannot be closed. This resolves the acting
 * scope instead and quietly does nothing when there is no workspace being onboarded.
 *
 * Returns whether the sequence still has something to say, which is how the publish
 * dialog knows to hand them on to the three "where to look" screens rather than just
 * closing.
 */
export async function acknowledgeAdLink(): Promise<{ resume: boolean }> {
  try {
    const scope = await resolveActingScope();
    const tenantId = scope.tenantId;
    if (!isBusinessTenant(tenantId) || !scope.canEdit) return { resume: false };

    const view = await getOnboardingView(tenantId, scope.user.id);
    // Nothing to join: this workspace has never started the sequence, so it is not
    // waiting on anything and does not want to be sent into it now.
    if (!view || !view.started) return { resume: false };

    await journal(tenantId, "copyAdLink", "ok");
    const after = await getOnboardingView(tenantId, scope.user.id);
    revalidatePath("/w/dashboard");
    return { resume: !!after && !after.complete };
  } catch {
    // This runs off a button whose only job is to close a dialog. Whatever went wrong
    // here, the dialog closes.
    return { resume: false };
  }
}

/**
 * Is this funnel ready for ad spend? One line per check (gate and exits, landing copy,
 * scored questions, bands 0 to 100, result page, pixel and CAPI, test event code, Meta
 * accepting a test run's server event, the browser pixel path, matching event ids,
 * published, and one test run per path), each pass or fail with the reason, plus `ready`
 * (every required line passes). Also returns the ad link: the public URL and the exact
 * text for the Meta ad's URL parameters field.
 */
export async function adReadiness(assessmentId: string): Promise<
  ActionResult<{
    assessment: string;
    ready: boolean;
    failing: string[];
    lines: ReadinessLine[];
    ad_link: { website_url: string; url_parameters: string; full_url: string };
  }>
> {
  const scope = await resolveActingScope();
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: {
      id: true,
      slug: true,
      title: true,
      status: true,
      tenantId: true,
      subheadline: true,
      description: true,
      startButtonLabel: true,
      qualification: true,
      disqualifiedContent: true,
      fireMetaCapi: true,
      adAccountId: true,
      resultsDocId: true,
      vslDocId: true,
      resultPagePublished: true,
      resultsDoc: { select: { publishedAt: true } },
      vslDoc: { select: { publishedAt: true } },
      categories: { select: { name: true, questions: { select: { text: true, type: true, _count: { select: { options: true } } } } } },
      resultBands: { select: { minScore: true, maxScore: true } },
    },
  });
  if (!a) return { ok: false, error: "Not found." };

  // --- gate -------------------------------------------------------------------------
  const q = qualificationSchema.safeParse(a.qualification ?? {});
  const qual = q.success ? q.data : EMPTY_QUALIFICATION;
  const gateActive = isQualificationActive(a.qualification);
  const exits = readExits(a.disqualifiedContent);
  const exitKeys = new Set(exits.map((e) => e.key));
  const routed = new Set<string>();
  const dangling = new Set<string>();
  let disqualifyOptions = 0;
  let waitlistOptions = 0;
  const route = (key: string, outcome: "DISQUALIFY" | "WAITLIST") => {
    if (outcome === "WAITLIST") waitlistOptions++;
    else disqualifyOptions++;
    const k = key.trim();
    if (k && !exitKeys.has(k)) dangling.add(k);
    const exit = resolveExit(exits, k);
    if (exit) routed.add(exit.key);
  };
  if (gateActive) {
    for (const question of qual.questions) {
      for (const o of question.options) {
        const outcome = optionOutcome(o);
        if (outcome !== "NONE") route(o.exitKey ?? "", outcome);
      }
    }
    if (qual.bands.enabled) route(qual.bands.belowExitKey ?? "", isWaitlistExitKey(qual.bands.belowExitKey) ? "WAITLIST" : "DISQUALIFY");
  }
  const exitsMissingCopy = exits
    .filter((e) => routed.has(e.key) && (!e.heading.trim() || (!e.subtext.trim() && !e.bodyHtml.trim())))
    .map((e) => e.name.trim() || e.key);

  // --- Meta -------------------------------------------------------------------------
  const [setting, meta] = await Promise.all([
    prisma.appSetting.findUnique({ where: appSettingWhere(a.tenantId) as never, select: { metaNotUsed: true } }),
    resolveMetaConfig(a.tenantId, a.adAccountId),
  ]);
  const workspaceUsesMeta = (setting as { metaNotUsed?: boolean } | null)?.metaNotUsed !== true;
  const usesMeta = a.fireMetaCapi && workspaceUsesMeta;
  const missing = [!meta.pixelId && "pixel id", !meta.capiToken && "Conversions API token"].filter(Boolean) as string[];
  const accountProblem = missing.length ? `The ad account this funnel reports to has no ${missing.join(" and no ")}.` : null;

  // --- test runs --------------------------------------------------------------------
  const [events, rejections, entries, completedSubs] = await Promise.all([
    prisma.runEvent.findMany({ where: { assessmentId: a.id, isPreview: true }, select: { source: true, eventName: true, eventId: true, status: true } }),
    prisma.gateDisqualification.findMany({ where: { assessmentId: a.id, isPreview: true, repeat: false }, select: { exitKey: true } }),
    prisma.gateEntry.findMany({ where: { assessmentId: a.id, isPreview: true }, select: { visitorId: true } }),
    prisma.submission.findMany({ where: { assessmentId: a.id, isPreview: true, status: "COMPLETED" }, select: { metaExternalId: true } }),
  ]);
  const capiOk = events.filter((e) => e.source === "capi" && (e.status === "test_sent" || e.status === "sent"));
  const pixel = events.filter((e) => e.source === "pixel");
  const pixelKeys = new Set(pixel.filter((e) => e.eventId).map((e) => `${e.eventName}|${e.eventId}`));
  const completedVisitors = new Set(completedSubs.map((s) => s.metaExternalId).filter(Boolean));

  const bound = !!(a.resultsDocId || a.vslDocId) || a.resultPagePublished !== null;
  const published = !!(a.resultsDoc?.publishedAt || a.vslDoc?.publishedAt) || a.resultPagePublished !== null;

  const { ready, lines } = evaluateAdReadiness({
    status: a.status,
    landing: { headline: a.title, subheadline: a.subheadline ?? "", intro: a.description ?? "", startButtonLabel: a.startButtonLabel ?? "" },
    gate: { active: gateActive, disqualifyOptions, waitlistOptions, danglingExitKeys: [...dangling], exitsMissingCopy },
    categories: a.categories.map((c) => ({
      name: c.name,
      questions: c.questions.length,
      unscoredQuestions: c.questions.filter((x) => x.type === "SINGLE_SELECT" && x._count.options < 2).map((x) => x.text.slice(0, 80)),
    })),
    resultBands: a.resultBands,
    resultPage: { bound, published },
    meta: { usesMeta, workspaceUsesMeta, accountProblem, hasTestEventCode: !!meta.testEventCode },
    runs: {
      capiAccepted: capiOk.length > 0,
      pixelReached: pixel.some((e) => e.status === "would_fire" || e.status === "fired"),
      idsMatch: capiOk.some((e) => e.eventId && pixelKeys.has(`${e.eventName}|${e.eventId}`)),
      turnedAway: rejections.filter((r) => !isWaitlistExitKey(r.exitKey)).length,
      waitlisted: rejections.filter((r) => isWaitlistExitKey(r.exitKey)).length,
      passedAndLeft: entries.filter((e) => !completedVisitors.has(e.visitorId)).length,
      completed: completedSubs.length,
    },
  });

  return {
    ok: true,
    data: {
      assessment: a.title,
      ready,
      failing: lines.filter((l) => l.required && !l.pass).map((l) => `${l.check}: ${l.detail}`),
      lines,
      ad_link: adLinkFor(await publicOriginFor(a.tenantId), a.slug),
    },
  };
}

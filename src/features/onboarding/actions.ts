"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireWorkspace, editDenied } from "@/lib/auth/guards";
import { resolveMetaConfig } from "@/lib/settings/config";
import { sendSmtpTest } from "@/features/nurture/actions";
import { importTemplate } from "@/features/templates/actions/library";
import { getOnboardingView, type OnboardingView } from "@/features/onboarding/data";
import { persistStep } from "@/features/onboarding/save";
import { STEP_BY_KEY, schemaFor } from "@/features/onboarding/steps";
import { type ActionResult } from "@/features/assessment/actions/shared";

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
export async function answerOnboardingStep(key: string, value: string): Promise<ActionResult<OnboardingView>> {
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
  return view(tenantId, user.id);
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
export async function importStarterTemplate(templateId: string): Promise<ActionResult<{ assessmentId: string }>> {
  const { user, tenantId } = await requireWorkspace();
  const denied = editDenied(user);
  if (denied) return denied;

  const r = await importTemplate(templateId);
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

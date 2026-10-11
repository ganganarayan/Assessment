"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import {
  qualificationSchema,
  disqualifiedContentSchema,
  isQualificationActive,
  readExits,
  type GateExitInput,
  type QualificationInput,
  type DisqualifiedContentInput,
} from "@/features/assessment/schemas";
import { type ActionResult, type QualificationSaveState } from "@/features/assessment/actions/shared";
import { assessmentInScope } from "@/features/assessment/actions/ownership";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";
import { assertEdit, resolveActingScope } from "@/lib/tenant/acting";
import { tenantCan } from "@/lib/billing/entitlements";

/**
 * The conditional disqualifying route is a Signal-and-up capability: more than one exit,
 * per-exit Meta events, and the score bands that decide who is waved through, flagged
 * for review or routed out. The Gate tier keeps the gate and its single exit.
 *
 * Returns an error result when the caller may not use it, else null. The app owner
 * (super admin) is never limited.
 */
async function conditionalExitDenied(): Promise<{ ok: false; error: string } | null> {
  const scope = await resolveActingScope();
  if (scope.isSuper) return null;
  if (await tenantCan(scope.tenantId, "conditionalExit")) return null;
  return {
    ok: false,
    error:
      "Conditional disqualifying routes are available on the Signal plan and up. Upgrade to send different answers to different exits.",
  };
}

/** Whether a saved gate actually uses the capability: an answer routing somewhere
 *  other than the first exit, or score bands switched on. One named exit on its own is
 *  just the exit page every plan has. */
function usesConditionalExit(q: QualificationInput): boolean {
  if (q.bands.enabled) return true;
  return q.questions.some((question) => question.options.some((o) => o.disqualifies && !!o.exitKey?.trim()));
}

/** Save the Page-1 qualification gate config for an assessment. */
export async function saveQualification(
  assessmentId: string,
  input: QualificationInput,
): Promise<ActionResult<QualificationSaveState>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;
  const parsed = qualificationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  // Billing gate: the pre-assessment qualification / disqualify gate is a Growth+
  // capability. TURNING IT ON needs the feature; saving an inactive/cleared config
  // (to turn it off) is always allowed. The app owner (super admin) is never limited.
  if (isQualificationActive(parsed.data)) {
    const scope = await resolveActingScope();
    if (!scope.isSuper && !(await tenantCan(scope.tenantId, "qualificationGate"))) {
      return { ok: false, error: "The qualification gate is available on the Growth plan and up. Upgrade to enable it." };
    }
    // Routing on top of the gate is the Signal capability. Checked only when the saved
    // config actually routes, so a Gate tenant can keep editing their single-exit gate.
    if (usesConditionalExit(parsed.data)) {
      const denied2 = await conditionalExitDenied();
      if (denied2) return denied2;
    }
  }

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { qualification: parsed.data as unknown as Prisma.InputJsonValue },
  });
  // The funnel renders this, so the cached funnel payload has to go. Without it the
  // gate appeared up to a minute later, which during an onboarding call is simply
  // "the gate does not work".
  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
  return {
    ok: true,
    data: {
      live: isQualificationActive(parsed.data),
      questionCount: parsed.data.questions.length,
    },
  };
}

/** Save the disqualified-page content for an assessment. */
export async function saveDisqualifiedContent(
  assessmentId: string,
  input: DisqualifiedContentInput,
): Promise<ActionResult> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;
  const parsed = disqualifiedContentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };

  // A second exit is the capability; the first one is the exit page every paid plan has.
  if (parsed.data.exits.length > 1) {
    const denied2 = await conditionalExitDenied();
    if (denied2) return denied2;
  }

  // Exit one's content is mirrored onto the legacy top-level fields. Derived, never
  // read back while `exits` exists, and written so that a rollback mid-deploy - or a
  // funnel payload cached a minute before this save - still renders a real page.
  const first = parsed.data.exits[0];
  const content = {
    ...parsed.data,
    ...(first
      ? {
          heading: first.heading,
          subtext: first.subtext,
          bodyHtml: first.bodyHtml,
          buttonLabel: first.buttonLabel,
          buttonUrl: first.buttonUrl,
          fireDisqualifiedEvent: first.fireDisqualifiedEvent,
        }
      : {}),
  };

  await prisma.assessment.update({
    where: { id: assessmentId },
    data: { disqualifiedContent: content as unknown as Prisma.InputJsonValue },
  });
  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
  return { ok: true };
}

/**
 * Make sure an exit with this NAME exists, and return its key.
 *
 * This is what makes the name field next to "Disqualifies" work the way it reads: the
 * owner types "Waitlist" on an answer, and a route called Waitlist appears in the exit
 * list, ready to be written. Without it the two halves of the builder are separate
 * forms that each save their own half, and a name typed in one would vanish until the
 * other was saved too.
 *
 * Appends to the stored content rather than replacing it, so an exit being edited in
 * the other half of the builder cannot be clobbered by a name typed here. Matching is
 * case-insensitive: "waitlist" and "Waitlist" are one route, because nobody means two.
 */
export async function ensureGateExit(
  assessmentId: string,
  name: string,
): Promise<ActionResult<{ key: string; name: string }>> {
  if (!(await assessmentInScope(assessmentId))) return { ok: false, error: "Not found." };
  const denied = await assertEdit();
  if (denied) return denied;

  const clean = name.trim().slice(0, 60);
  if (!clean) return { ok: false, error: "Give the exit a name." };

  const row = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    select: { disqualifiedContent: true },
  });
  const exits = readExits(row?.disqualifiedContent);

  const existing = exits.find((e) => e.name.trim().toLowerCase() === clean.toLowerCase());
  if (existing) return { ok: true, data: { key: existing.key, name: existing.name } };

  // The first exit of a gate that has never been named is the one already there (the
  // old single disqualified page), so naming it adopts it instead of adding a second.
  const firstUnnamed = exits.length === 1 && !exits[0]?.name.trim() ? exits[0] : null;
  if (firstUnnamed) {
    const renamed = exits.map((e) => (e.key === firstUnnamed.key ? { ...e, name: clean } : e));
    await writeExits(assessmentId, renamed);
    return { ok: true, data: { key: firstUnnamed.key, name: clean } };
  }

  // A second exit is the Signal capability.
  const gated = await conditionalExitDenied();
  if (gated) return gated;
  if (exits.length >= 20) return { ok: false, error: "That is as many exits as one gate can have." };

  const created = {
    key: `exit_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    name: clean,
    mode: "PAGE" as const,
    heading: "",
    subtext: "",
    bodyHtml: "",
    buttonLabel: "",
    buttonUrl: "",
    // A NEW exit reports nothing until the owner names its event. Defaulting it to
    // GateDisqualified would quietly file waitlist sign-ups and wrong-fit visitors into
    // one exclusion audience, which is the exact thing routes exist to prevent.
    fireDisqualifiedEvent: true,
    eventName: "",
    contentCategory: "",
  };
  await writeExits(assessmentId, [...exits, created]);
  return { ok: true, data: { key: created.key, name: created.name } };
}

/** Persist an exits array, keeping exit one mirrored onto the legacy fields. */
async function writeExits(assessmentId: string, exits: GateExitInput[]): Promise<void> {
  const first = exits[0];
  await prisma.assessment.update({
    where: { id: assessmentId },
    data: {
      disqualifiedContent: {
        exits,
        heading: first?.heading ?? "",
        subtext: first?.subtext ?? "",
        bodyHtml: first?.bodyHtml ?? "",
        buttonLabel: first?.buttonLabel ?? "",
        buttonUrl: first?.buttonUrl ?? "",
        fireDisqualifiedEvent: first?.fireDisqualifiedEvent ?? true,
      } as unknown as Prisma.InputJsonValue,
    },
  });
  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath(`/w/assessments/${assessmentId}`);
}

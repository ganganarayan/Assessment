"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope } from "@/lib/tenant/acting";
import { assessmentSchema, type AssessmentInput } from "@/features/assessment/schemas";
import { originOf } from "@/lib/result/cors";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

/** Verify an assessment is owned by the caller's scope (tenant, or any for super-global).
 *  Returns false if it doesn't exist or belongs to a different tenant. */
async function ownsAssessment(
  id: string,
  scope: Awaited<ReturnType<typeof resolveActingScope>>,
): Promise<boolean> {
  const found = await prisma.assessment.findFirst({
    where: { id, ...tenantScope(scope) },
    select: { id: true },
  });
  return !!found;
}

export async function createAssessment(
  input: AssessmentInput,
): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  if (!scope.isSuper && !scope.tenantId) {
    return { ok: false, error: "No workspace." };
  }
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const existing = await prisma.assessment.findUnique({ where: { slug: d.slug } });
  if (existing) return { ok: false, error: "That slug is already in use." };

  const created = await prisma.assessment.create({
    data: {
      title: d.title,
      slug: d.slug,
      description: nullifyEmpty(d.description),
      coverImageUrl: nullifyEmpty(d.coverImageUrl),
      estimatedMinutes: d.estimatedMinutes ?? null,
      thankYouMessage: nullifyEmpty(d.thankYouMessage),
      collectFirstName: d.collectFirstName,
      firstNameRequired: d.firstNameRequired,
      collectLastName: d.collectLastName,
      lastNameRequired: d.lastNameRequired,
      collectEmail: d.collectEmail,
      emailRequired: d.emailRequired,
      collectMobile: d.collectMobile,
      mobileRequired: d.mobileRequired,
      collectProfession: d.collectProfession,
      professionRequired: d.professionRequired,
      professionOptions: d.professionOptions,
      introNotice: nullifyEmpty(d.introNotice),
      startButtonLabel: nullifyEmpty(d.startButtonLabel),
      retakePolicy: d.retakePolicy,
      retakeDays: d.retakeDays,
      uniqueIdentifier: d.uniqueIdentifier,
      trainingUrl: nullifyEmpty(d.trainingUrl),
      targetUrl: nullifyEmpty(d.targetUrl),
      targetOrigin: originOf(nullifyEmpty(d.targetUrl)),
      tokenTtlSeconds: d.tokenTtlSeconds ?? null,
      vslCountdownSeconds: d.vslCountdownSeconds,
      questionDisplayMode: d.questionDisplayMode,
      // nextStep is the source of truth; keep the legacy paidMode boolean in sync
      // so existing payment/event/runner logic keeps working unchanged.
      nextStep: d.nextStep,
      paidMode: d.nextStep === "PAYMENT",
      paymentUrl: nullifyEmpty(d.paymentUrl),
      paymentHeadline: nullifyEmpty(d.paymentHeadline),
      paymentButtonLabel: nullifyEmpty(d.paymentButtonLabel),
      paymentAmount: d.paymentAmount ?? null,
      paymentEventName: (d.paymentEventName?.trim() || "Purchase121"),
      paymentIntroText: nullifyEmpty(d.paymentIntroText),
      createdById: scope.user.id,
      tenantId: scope.tenantId,
    },
  });

  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true, data: { id: created.id } };
}

export async function updateAssessment(
  id: string,
  input: AssessmentInput,
): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  if (!(await ownsAssessment(id, scope))) {
    return { ok: false, error: "Not found." };
  }
  const parsed = assessmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }
  const d = parsed.data;

  const slugOwner = await prisma.assessment.findUnique({ where: { slug: d.slug } });
  if (slugOwner && slugOwner.id !== id) {
    return { ok: false, error: "That slug is already in use." };
  }

  await prisma.assessment.update({
    where: { id },
    data: {
      title: d.title,
      slug: d.slug,
      description: nullifyEmpty(d.description),
      coverImageUrl: nullifyEmpty(d.coverImageUrl),
      estimatedMinutes: d.estimatedMinutes ?? null,
      thankYouMessage: nullifyEmpty(d.thankYouMessage),
      collectFirstName: d.collectFirstName,
      firstNameRequired: d.firstNameRequired,
      collectLastName: d.collectLastName,
      lastNameRequired: d.lastNameRequired,
      collectEmail: d.collectEmail,
      emailRequired: d.emailRequired,
      collectMobile: d.collectMobile,
      mobileRequired: d.mobileRequired,
      collectProfession: d.collectProfession,
      professionRequired: d.professionRequired,
      professionOptions: d.professionOptions,
      introNotice: nullifyEmpty(d.introNotice),
      startButtonLabel: nullifyEmpty(d.startButtonLabel),
      retakePolicy: d.retakePolicy,
      retakeDays: d.retakeDays,
      uniqueIdentifier: d.uniqueIdentifier,
      trainingUrl: nullifyEmpty(d.trainingUrl),
      targetUrl: nullifyEmpty(d.targetUrl),
      targetOrigin: originOf(nullifyEmpty(d.targetUrl)),
      tokenTtlSeconds: d.tokenTtlSeconds ?? null,
      vslCountdownSeconds: d.vslCountdownSeconds,
      questionDisplayMode: d.questionDisplayMode,
      // nextStep is the source of truth; keep the legacy paidMode boolean in sync
      // so existing payment/event/runner logic keeps working unchanged.
      nextStep: d.nextStep,
      paidMode: d.nextStep === "PAYMENT",
      paymentUrl: nullifyEmpty(d.paymentUrl),
      paymentHeadline: nullifyEmpty(d.paymentHeadline),
      paymentButtonLabel: nullifyEmpty(d.paymentButtonLabel),
      paymentAmount: d.paymentAmount ?? null,
      paymentEventName: (d.paymentEventName?.trim() || "Purchase121"),
      paymentIntroText: nullifyEmpty(d.paymentIntroText),
    },
  });

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  revalidatePath("/w/assessments");
  return { ok: true, data: { id } };
}

export async function deleteAssessment(id: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!(await ownsAssessment(id, scope))) {
    return { ok: false, error: "Not found." };
  }
  await prisma.assessment.delete({ where: { id } });
  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true };
}

export async function setAssessmentStatus(
  id: string,
  publish: boolean,
): Promise<ActionResult> {
  const scope = await resolveActingScope();
  if (!(await ownsAssessment(id, scope))) {
    return { ok: false, error: "Not found." };
  }
  await prisma.assessment.update({
    where: { id },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });
  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  revalidatePath("/w/assessments");
  return { ok: true };
}

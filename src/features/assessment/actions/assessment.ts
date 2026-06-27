"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { assessmentSchema, type AssessmentInput } from "@/features/assessment/schemas";
import { originOf } from "@/lib/result/cors";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

export async function createAssessment(
  input: AssessmentInput,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireSuperAdmin();
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
      retakePolicy: d.retakePolicy,
      retakeDays: d.retakeDays,
      uniqueIdentifier: d.uniqueIdentifier,
      trainingUrl: nullifyEmpty(d.trainingUrl),
      targetUrl: nullifyEmpty(d.targetUrl),
      targetOrigin: originOf(nullifyEmpty(d.targetUrl)),
      tokenTtlSeconds: d.tokenTtlSeconds ?? null,
      paidMode: d.paidMode,
      paymentUrl: nullifyEmpty(d.paymentUrl),
      paymentHeadline: nullifyEmpty(d.paymentHeadline),
      paymentButtonLabel: nullifyEmpty(d.paymentButtonLabel),
      paymentAmount: d.paymentAmount ?? null,
      paymentEventName: (d.paymentEventName?.trim() || "Purchase121"),
      createdById: user.id,
    },
  });

  revalidatePath("/admin/assessments");
  return { ok: true, data: { id: created.id } };
}

export async function updateAssessment(
  id: string,
  input: AssessmentInput,
): Promise<ActionResult<{ id: string }>> {
  await requireSuperAdmin();
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
      retakePolicy: d.retakePolicy,
      retakeDays: d.retakeDays,
      uniqueIdentifier: d.uniqueIdentifier,
      trainingUrl: nullifyEmpty(d.trainingUrl),
      targetUrl: nullifyEmpty(d.targetUrl),
      targetOrigin: originOf(nullifyEmpty(d.targetUrl)),
      tokenTtlSeconds: d.tokenTtlSeconds ?? null,
      paidMode: d.paidMode,
      paymentUrl: nullifyEmpty(d.paymentUrl),
      paymentHeadline: nullifyEmpty(d.paymentHeadline),
      paymentButtonLabel: nullifyEmpty(d.paymentButtonLabel),
      paymentAmount: d.paymentAmount ?? null,
      paymentEventName: (d.paymentEventName?.trim() || "Purchase121"),
    },
  });

  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { ok: true, data: { id } };
}

export async function deleteAssessment(id: string): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.assessment.delete({ where: { id } });
  revalidatePath("/admin/assessments");
  return { ok: true };
}

export async function setAssessmentStatus(
  id: string,
  publish: boolean,
): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.assessment.update({
    where: { id },
    data: {
      status: publish ? "PUBLISHED" : "DRAFT",
      publishedAt: publish ? new Date() : null,
    },
  });
  revalidatePath("/admin/assessments");
  revalidatePath(`/admin/assessments/${id}`);
  return { ok: true };
}

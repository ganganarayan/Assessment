"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { getAssessmentById } from "@/features/assessment/data";
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
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
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
      eyebrow: nullifyEmpty(d.eyebrow),
      subheadline: nullifyEmpty(d.subheadline),
      description: nullifyEmpty(d.description),
      buttonColor: nullifyEmpty(d.buttonColor),
      buttonTextColor: nullifyEmpty(d.buttonTextColor),
      preResultHeading: nullifyEmpty(d.preResultHeading),
      preResultSubtext: nullifyEmpty(d.preResultSubtext),
      preResultFields: d.preResultFields as unknown as Prisma.InputJsonValue,
      optinFields: d.optinFields as unknown as Prisma.InputJsonValue,
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
      firstNameLabel: nullifyEmpty(d.firstNameLabel),
      lastNameLabel: nullifyEmpty(d.lastNameLabel),
      emailLabel: nullifyEmpty(d.emailLabel),
      mobileLabel: nullifyEmpty(d.mobileLabel),
      professionLabel: nullifyEmpty(d.professionLabel),
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
      aiPromptVersionId: nullifyEmpty(d.aiPromptVersionId),
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
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
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
      eyebrow: nullifyEmpty(d.eyebrow),
      subheadline: nullifyEmpty(d.subheadline),
      description: nullifyEmpty(d.description),
      buttonColor: nullifyEmpty(d.buttonColor),
      buttonTextColor: nullifyEmpty(d.buttonTextColor),
      preResultHeading: nullifyEmpty(d.preResultHeading),
      preResultSubtext: nullifyEmpty(d.preResultSubtext),
      preResultFields: d.preResultFields as unknown as Prisma.InputJsonValue,
      optinFields: d.optinFields as unknown as Prisma.InputJsonValue,
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
      firstNameLabel: nullifyEmpty(d.firstNameLabel),
      lastNameLabel: nullifyEmpty(d.lastNameLabel),
      emailLabel: nullifyEmpty(d.emailLabel),
      mobileLabel: nullifyEmpty(d.mobileLabel),
      professionLabel: nullifyEmpty(d.professionLabel),
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
      aiPromptVersionId: nullifyEmpty(d.aiPromptVersionId),
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
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
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
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
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

/**
 * Deep-copy an assessment (all categories → questions → options + category bands,
 * result bands, and result pages → blocks) into a fresh DRAFT with a unique slug.
 * Never copies submissions/payments/events — the copy starts clean. Scoped: a tenant
 * can only duplicate its own; the copy inherits the acting tenant.
 */
export async function duplicateAssessment(id: string): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!(await ownsAssessment(id, scope))) return { ok: false, error: "Not found." };
  const src = await getAssessmentById(id);
  if (!src) return { ok: false, error: "Not found." };

  // Unique slug: "<slug>-copy", then "-copy-2", "-copy-3", … (slug is globally unique).
  const base = `${src.slug}-copy`;
  let slug = base;
  for (let n = 2; await prisma.assessment.findUnique({ where: { slug }, select: { id: true } }); n++) {
    slug = `${base}-${n}`;
  }

  const created = await prisma.assessment.create({
    data: {
      title: `${src.title} (Copy)`,
      slug,
      status: "DRAFT",
      publishedAt: null,
      // The copy is a draft — nothing is live yet. The draft page ROWS are copied
      // below so it can be edited + published; the live snapshot starts empty.
      publishedPages: Prisma.DbNull,
      pagesPublishedAt: null,
      eyebrow: src.eyebrow,
      subheadline: src.subheadline,
      description: src.description,
      buttonColor: src.buttonColor,
      buttonTextColor: src.buttonTextColor,
      preResultHeading: src.preResultHeading,
      preResultSubtext: src.preResultSubtext,
      preResultFields: (src.preResultFields ?? Prisma.DbNull) as Prisma.InputJsonValue,
      optinFields: (src.optinFields ?? Prisma.DbNull) as Prisma.InputJsonValue,
      coverImageUrl: src.coverImageUrl,
      estimatedMinutes: src.estimatedMinutes,
      thankYouMessage: src.thankYouMessage,
      collectFirstName: src.collectFirstName,
      firstNameRequired: src.firstNameRequired,
      collectLastName: src.collectLastName,
      lastNameRequired: src.lastNameRequired,
      collectEmail: src.collectEmail,
      emailRequired: src.emailRequired,
      collectMobile: src.collectMobile,
      mobileRequired: src.mobileRequired,
      collectProfession: src.collectProfession,
      professionRequired: src.professionRequired,
      professionOptions: src.professionOptions,
      firstNameLabel: src.firstNameLabel,
      lastNameLabel: src.lastNameLabel,
      emailLabel: src.emailLabel,
      mobileLabel: src.mobileLabel,
      professionLabel: src.professionLabel,
      introNotice: src.introNotice,
      startButtonLabel: src.startButtonLabel,
      retakePolicy: src.retakePolicy,
      retakeDays: src.retakeDays,
      uniqueIdentifier: src.uniqueIdentifier,
      trainingUrl: src.trainingUrl,
      targetUrl: src.targetUrl,
      targetOrigin: src.targetOrigin,
      tokenTtlSeconds: src.tokenTtlSeconds,
      vslCountdownSeconds: src.vslCountdownSeconds,
      questionDisplayMode: src.questionDisplayMode,
      aiPromptVersionId: src.aiPromptVersionId,
      nextStep: src.nextStep,
      paidMode: src.paidMode,
      paymentUrl: src.paymentUrl,
      paymentHeadline: src.paymentHeadline,
      paymentButtonLabel: src.paymentButtonLabel,
      paymentAmount: src.paymentAmount,
      paymentEventName: src.paymentEventName,
      paymentIntroText: src.paymentIntroText,
      createdById: scope.user.id,
      tenantId: scope.tenantId,
      categories: {
        create: src.categories.map((c) => ({
          name: c.name,
          description: c.description,
          displayOrder: c.displayOrder,
          questions: {
            create: c.questions.map((q) => ({
              text: q.text,
              weight: q.weight,
              required: q.required,
              displayOrder: q.displayOrder,
              options: {
                create: q.options.map((o) => ({
                  label: o.label,
                  value: o.value,
                  displayOrder: o.displayOrder,
                })),
              },
            })),
          },
          bands: {
            create: c.bands.map((b) => ({
              label: b.label,
              meaning: b.meaning,
              minScore: b.minScore,
              maxScore: b.maxScore,
              displayOrder: b.displayOrder,
            })),
          },
        })),
      },
      resultBands: {
        create: src.resultBands.map((b) => ({
          level: b.level,
          title: b.title,
          description: b.description,
          minScore: b.minScore,
          maxScore: b.maxScore,
          displayOrder: b.displayOrder,
        })),
      },
      pages: {
        create: src.pages.map((p) => ({
          order: p.order,
          title: p.title,
          blocks: {
            create: p.blocks.map((bl) => ({
              type: bl.type,
              order: bl.order,
              config: (bl.config ?? {}) as Prisma.InputJsonValue,
            })),
          },
        })),
      },
    },
    select: { id: true },
  });

  revalidatePath("/admin/assessment-builder");
  revalidatePath("/admin/assessments");
  revalidatePath("/w/assessments");
  return { ok: true, data: { id: created.id } };
}

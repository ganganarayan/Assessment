"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, tenantScope, scopeEditDenied } from "@/lib/tenant/acting";
import { invalidatePublicAssessmentById } from "@/features/assessment/data";
import { type ActionResult, nullifyEmpty } from "@/features/assessment/actions/shared";

/**
 * The opt-in landing screen on its own: the copy a visitor reads before the first
 * question. updateAssessment saves the WHOLE funnel in one object (every capture
 * switch, retake rule and gate), so a caller that only wants to reword the headline
 * would have to resend everything and could reset a switch by leaving it out. These
 * two read and patch the landing copy only, with the same workspace checks.
 */

const text = (max: number) => z.string().trim().max(max).optional();

const landingSchema = z
  .object({
    headline: z.string().trim().min(2, "The headline needs at least 2 characters.").max(160).optional(),
    eyebrow: text(200),
    subheadline: text(500),
    intro: text(2000),
    notice: text(2000),
    startButtonLabel: text(120),
    coverImageUrl: z.string().trim().url("Cover image must be a full URL.").optional().or(z.literal("")),
    estimatedMinutes: z.number().int().min(0).max(600).nullable().optional(),
  })
  .strict();

export type LandingScreenInput = z.input<typeof landingSchema>;

export interface LandingScreen {
  /** The big line at the top. Stored as the assessment title. */
  headline: string;
  /** Small kicker above the headline. Empty = hidden. */
  eyebrow: string;
  /** Secondary line under the headline. Empty = hidden. */
  subheadline: string;
  /** Body text under the headline. Empty = hidden. */
  intro: string;
  /** Note near the start button. Empty = the app's own retake message. */
  notice: string;
  /** Start button text. Empty = the default label. */
  startButtonLabel: string;
  coverImageUrl: string;
  estimatedMinutes: number | null;
}

/** Read the landing screen copy of one assessment: headline, eyebrow, subheadline, intro, notice, start button label, cover image, estimated minutes. */
export async function getLandingScreen(assessmentId: string): Promise<ActionResult<LandingScreen>> {
  const scope = await resolveActingScope();
  const a = await prisma.assessment.findFirst({
    where: { id: assessmentId, ...tenantScope(scope) },
    select: {
      title: true,
      eyebrow: true,
      subheadline: true,
      description: true,
      introNotice: true,
      startButtonLabel: true,
      coverImageUrl: true,
      estimatedMinutes: true,
    },
  });
  if (!a) return { ok: false, error: "Not found." };
  return {
    ok: true,
    data: {
      headline: a.title,
      eyebrow: a.eyebrow ?? "",
      subheadline: a.subheadline ?? "",
      intro: a.description ?? "",
      notice: a.introNotice ?? "",
      startButtonLabel: a.startButtonLabel ?? "",
      coverImageUrl: a.coverImageUrl ?? "",
      estimatedMinutes: a.estimatedMinutes,
    },
  };
}

/** Save the landing screen copy. Only the fields passed change; pass "" to clear one. Fields: headline, eyebrow, subheadline, intro, notice, startButtonLabel, coverImageUrl, estimatedMinutes. */
export async function saveLandingScreen(assessmentId: string, input: LandingScreenInput): Promise<ActionResult<{ id: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const found = await prisma.assessment.findFirst({ where: { id: assessmentId, ...tenantScope(scope) }, select: { id: true } });
  if (!found) return { ok: false, error: "Not found." };

  const parsed = landingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
  const d = parsed.data;

  const data: {
    title?: string;
    eyebrow?: string | null;
    subheadline?: string | null;
    description?: string | null;
    introNotice?: string | null;
    startButtonLabel?: string | null;
    coverImageUrl?: string | null;
    estimatedMinutes?: number | null;
  } = {};
  if (d.headline !== undefined) data.title = d.headline;
  if (d.eyebrow !== undefined) data.eyebrow = nullifyEmpty(d.eyebrow);
  if (d.subheadline !== undefined) data.subheadline = nullifyEmpty(d.subheadline);
  if (d.intro !== undefined) data.description = nullifyEmpty(d.intro);
  if (d.notice !== undefined) data.introNotice = nullifyEmpty(d.notice);
  if (d.startButtonLabel !== undefined) data.startButtonLabel = nullifyEmpty(d.startButtonLabel);
  if (d.coverImageUrl !== undefined) data.coverImageUrl = nullifyEmpty(d.coverImageUrl);
  if (d.estimatedMinutes !== undefined) data.estimatedMinutes = d.estimatedMinutes;
  if (Object.keys(data).length === 0) return { ok: false, error: "Nothing to save: pass at least one landing field." };

  await prisma.assessment.update({ where: { id: assessmentId }, data });
  await invalidatePublicAssessmentById(assessmentId);
  revalidatePath(`/admin/assessments/${assessmentId}`);
  revalidatePath("/w/assessments");
  return { ok: true, data: { id: assessmentId } };
}

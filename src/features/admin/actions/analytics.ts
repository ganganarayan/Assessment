"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Permanently DELETE all analytics data so Stats and Contacts start at zero:
 * submissions (with their answers + category scores) and page views. NOT
 * touched: assessments, categories, questions, options, result bands, webhooks,
 * users, and the audit logs (EventLog / WebhookLog keep their history — they
 * reference submissionId only as a plain scalar, no FK).
 *
 * Irreversible. Super-admin only. Children are deleted explicitly so it can't
 * fail on a foreign key regardless of cascade configuration.
 */
export async function clearAnalyticsData(): Promise<ActionResult> {
  await requireSuperAdmin();
  await prisma.$transaction([
    prisma.submissionAnswer.deleteMany({}),
    prisma.submissionCategoryScore.deleteMany({}),
    prisma.submission.deleteMany({}),
    prisma.pageView.deleteMany({}),
  ]);
  revalidatePath("/admin");
  revalidatePath("/admin/analytics/stats");
  revalidatePath("/admin/analytics/contacts");
  revalidatePath("/admin/submissions");
  return { ok: true };
}

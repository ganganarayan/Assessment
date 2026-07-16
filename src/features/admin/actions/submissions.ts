"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Permanently delete selected submissions (contacts) and their results. Cascades
 * to answers, category scores and AI-statement versions (FK onDelete: Cascade).
 * Page views and audit logs (EventLog/WebhookLog reference submissionId as a
 * plain scalar) are not affected. Super-admin only; irreversible.
 */
export async function deleteSubmissions(ids: string[]): Promise<ActionResult> {
  { const __d = editDenied(await requireSuperAdmin()); if (__d) return __d; }
  const clean = (ids ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return { ok: true };
  await prisma.submission.deleteMany({ where: { id: { in: clean } } });
  revalidatePath("/admin/analytics/contacts");
  revalidatePath("/admin/analytics/stats");
  revalidatePath("/admin/submissions");
  return { ok: true };
}

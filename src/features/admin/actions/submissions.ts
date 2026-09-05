"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Permanently delete selected submissions (contacts) and their results. Cascades
 * to answers, category scores and AI-statement versions (FK onDelete: Cascade).
 * Page views and audit logs (EventLog/WebhookLog reference submissionId as a
 * plain scalar) are not affected. Irreversible.
 *
 * TENANT-SCOPED: a tenant admin/staff-with-edit may delete ONLY their own tenant's
 * submissions — the delete is filtered by tenantId, so passing another tenant's id
 * simply matches nothing. A super admin acting globally (tenantId null) may delete
 * any. View-only staff are refused. This is what lets /w/submissions expose delete
 * safely, not just the platform console.
 */
export async function deleteSubmissions(ids: string[]): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const clean = (ids ?? []).filter((id) => typeof id === "string" && id.length > 0);
  if (clean.length === 0) return { ok: true };

  // Super admin with no acting tenant = global; otherwise constrain to the scope's
  // tenant so a tenant can never delete across the boundary.
  const where =
    scope.isSuper && scope.tenantId === null
      ? { id: { in: clean } }
      : { id: { in: clean }, tenantId: scope.tenantId };
  await prisma.submission.deleteMany({ where });

  revalidatePath("/admin/analytics/contacts");
  revalidatePath("/admin/analytics/stats");
  revalidatePath("/admin/submissions");
  revalidatePath("/w/submissions");
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Reset analytics to zero: set the baseline to now. Non-destructive — past
 * submissions/leads and page views are kept, just excluded from the Stats and
 * Contacts pages (the full record stays on the Submissions page). Reusable.
 */
export async function resetStats(): Promise<ActionResult> {
  await requireSuperAdmin();
  const now = new Date();
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { statsResetAt: now },
    create: { id: "singleton", statsResetAt: now },
  });
  revalidatePath("/admin/analytics/stats");
  revalidatePath("/admin/analytics/contacts");
  return { ok: true };
}

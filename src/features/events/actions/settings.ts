"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { type ActionResult } from "@/features/assessment/actions/shared";

const hoursSchema = z.coerce.number().int().min(1).max(8760);

export async function updateAbandonedHours(hours: number): Promise<ActionResult> {
  { const __d = editDenied(await requireSuperAdmin()); if (__d) return __d; }
  const parsed = hoursSchema.safeParse(hours);
  if (!parsed.success) {
    return { ok: false, error: "Enter a value between 1 and 8760 hours." };
  }
  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: { abandonedAfterHours: parsed.data },
    create: { id: "singleton", abandonedAfterHours: parsed.data },
  });
  revalidatePath("/admin/settings");
  return { ok: true };
}

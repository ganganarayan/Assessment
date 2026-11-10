"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf, scopeEditDenied } from "@/lib/tenant/acting";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { type ActionResult } from "@/features/assessment/actions/shared";

const hoursSchema = z.coerce.number().int().min(1).max(8760);

/**
 * "Abandoned after" hours for the ACTING workspace (Phase 5). It was one platform value
 * written to the singleton by a super admin, so saving it while inside a tenant changed
 * it for every tenant. Now each workspace has its own, and the sweep reads each one
 * (lib/events/abandoned.ts cutoffGroups).
 */
export async function getAbandonedHours(): Promise<number> {
  const scope = await resolveActingScope();
  const row = await prisma.appSetting.findUnique({
    where: appSettingWhere(configTenantOf(scope)),
    select: { abandonedAfterHours: true },
  });
  return row?.abandonedAfterHours ?? 24;
}

export async function updateAbandonedHours(hours: number): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const parsed = hoursSchema.safeParse(hours);
  if (!parsed.success) {
    return { ok: false, error: "Enter a value between 1 and 8760 hours." };
  }
  const tenantId = configTenantOf(scope);
  await prisma.appSetting.upsert({
    where: appSettingWhere(tenantId),
    update: { abandonedAfterHours: parsed.data },
    create: { id: tenantAppSettingId(tenantId), tenantId, abandonedAfterHours: parsed.data },
  });
  revalidatePath("/admin/settings");
  revalidatePath("/w/settings");
  return { ok: true };
}

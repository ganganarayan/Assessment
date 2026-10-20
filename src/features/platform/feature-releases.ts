"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { formatIST } from "@/lib/date";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  RELEASABLE_FEATURES,
  defaultReleased,
  isFeatureReleaseKey,
  type FeatureReleaseStatus,
} from "@/lib/features/catalog";
import { writeFeatureRelease } from "@/lib/features/release";

/**
 * Feature releases - who gets to see a finished feature, and when. Super admin only.
 *
 * The switch is PLATFORM-WIDE by decision: not selectable per tenant, because "which
 * customers have which features" is a support problem that grows with the customer
 * list, and a per-tenant switch is also a per-tenant bug report. One switch means one
 * answer to "is this live".
 */

/** Every releasable feature with the state of its switch, for the console. */
export async function listFeatureReleases(): Promise<ActionResult<FeatureReleaseStatus[]>> {
  await requireSuperAdmin();
  try {
    const rows = await prisma.featureRelease.findMany({
      select: { key: true, released: true, releasedAt: true, note: true, changedByUserId: true },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));

    // Resolve the names in one query rather than one per row.
    const userIds = [...new Set(rows.map((r) => r.changedByUserId).filter((v): v is string => !!v))];
    const users = userIds.length
      ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
      : [];
    const nameOf = new Map(users.map((u) => [u.id, u.name?.trim() || u.email]));

    return {
      ok: true,
      data: RELEASABLE_FEATURES.map((f) => {
        const row = byKey.get(f.key);
        return {
          ...f,
          // No row = the catalog default. Shown as the real state, because that IS the
          // state the gates are using - a console that showed "off" for a feature the
          // app is treating as on would be worse than no console.
          released: row ? row.released : defaultReleased(f.key),
          releasedAt: row?.releasedAt ? formatIST(row.releasedAt) : null,
          note: row?.note ?? null,
          changedBy: row?.changedByUserId ? (nameOf.get(row.changedByUserId) ?? null) : null,
        };
      }),
    };
  } catch (e) {
    console.error("[platform] listFeatureReleases failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't load the feature releases (a temporary database error)." };
  }
}

/**
 * Release a feature to every workspace, or hold it back again.
 *
 * Reversible on purpose. Holding a feature back is a KILL SWITCH, not a deletion:
 * everything a tenant configured stays in its row, unread, and switching back on
 * restores exactly what was there. That is the difference between pulling a feature and
 * reverting a deploy, and it is the whole reason this exists.
 */
export async function setFeatureRelease(key: string, released: boolean): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return { ok: false, error: "Only an owner can release a feature." };
  if (!isFeatureReleaseKey(key)) return { ok: false, error: "That is not a releasable feature." };

  try {
    await writeFeatureRelease(key, released, me.id, released ? "Released from the platform console." : "Held back from the platform console.");
  } catch (e) {
    console.error("[platform] setFeatureRelease failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't save that switch (a temporary database error). Try again." };
  }

  // The workspace shell reads this on every render to decide the menu, and the two
  // WhatsApp screens read it to decide whether the sender exists at all.
  revalidatePath("/platform");
  revalidatePath("/admin/settings");
  revalidatePath("/admin/nurture");
  revalidatePath("/w", "layout");
  return { ok: true };
}

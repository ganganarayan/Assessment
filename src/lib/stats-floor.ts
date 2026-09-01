import "server-only";
import { prisma } from "@/lib/db/prisma";

/**
 * The reporting start date (AppSetting.statsResetAt). When set, all analytics
 * views (dashboard, stats, contacts, submissions) show only records at/after it —
 * a non-destructive "show data from this date onward". Null = all time.
 */
export async function getStatsFloor(tenantId: string | null = null): Promise<Date | null> {
  // A tenant reads its OWN window (its AppSetting row); the platform/Gita view reads
  // the singleton. A tenant never inherits the singleton (so Gita's window is private).
  const s = tenantId
    ? await prisma.appSetting.findUnique({ where: { tenantId }, select: { statsResetAt: true } })
    : await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { statsResetAt: true } });
  return s?.statsResetAt ?? null;
}

/**
 * Build a `createdAt` where-fragment combining the reporting floor with an
 * optional date range: the effective lower bound is the LATER of the floor and
 * the range's `gte`. `{}` when neither bound applies.
 */
export function floorCreatedAt(
  floor: Date | null,
  gte?: Date | null,
  lte?: Date | null,
): Record<string, unknown> {
  let lower: Date | null = gte ?? null;
  if (floor && (!lower || floor.getTime() > lower.getTime())) lower = floor;
  if (!lower && !lte) return {};
  return { createdAt: { ...(lower ? { gte: lower } : {}), ...(lte ? { lte } : {}) } };
}

/** Convenience: a createdAt where-fragment for just the floor (no date range). */
export async function floorWhere(): Promise<Record<string, unknown>> {
  return floorCreatedAt(await getStatsFloor());
}

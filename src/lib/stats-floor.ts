import "server-only";
import { prisma } from "@/lib/db/prisma";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isSingleTenant, type Scope } from "@/lib/tenant/scope";

/**
 * The reporting start date (AppSetting.statsResetAt). When set, all analytics
 * views (dashboard, stats, contacts, submissions) show only records at/after it -
 * a non-destructive "show data from this date onward". Null = all time.
 */
export async function getStatsFloor(tenantId: string | null = null): Promise<Date | null> {
  // A tenant reads its OWN window (its AppSetting row); the platform reads the
  // singleton. A tenant never inherits the singleton, so one tenant's window is
  // never silently applied to another's numbers.
  const s = await prisma.appSetting.findUnique({
    where: appSettingWhere(tenantId) as never,
    select: { statsResetAt: true },
  });
  return s?.statsResetAt ?? null;
}

/**
 * The reporting floor for a data scope. `{ kind: "all" }` - an owner looking across
 * every tenant - uses the PLATFORM's window, because there is no single tenant whose
 * window would apply and the alternative (the later/earlier of N tenants' windows)
 * would silently hide one tenant's rows using another's setting.
 */
export async function statsFloorFor(scope: Scope): Promise<Date | null> {
  return getStatsFloor(isSingleTenant(scope) ? scope.tenantId : null);
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

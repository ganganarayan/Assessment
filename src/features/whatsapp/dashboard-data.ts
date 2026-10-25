import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { snapshotIsStale, type WabaSnapshot } from "@/lib/whatsapp/snapshot";

/**
 * Reading the stored WABA snapshot for a screen.
 *
 * Nothing here talks to Meta. The read is deliberately separate from the refresh so
 * that opening the page costs a database query and never an API call: a dashboard that
 * phones Meta on every view is a dashboard that eventually throttles the sending.
 */

export interface DashboardView {
  /** False when no number is connected, which is a different screen entirely. */
  connected: boolean;
  /** DD-MM-YYYY HH:MM IST, or null when Meta has never been asked. */
  fetchedAt: string | null;
  /** Older than an hour, so the screen can suggest a refresh without nagging. */
  stale: boolean;
  /** The window the figures cover, already formatted. */
  window: { from: string; to: string } | null;
  snapshot: WabaSnapshot | null;
  /** True for a number that is also live on somebody's phone. */
  coexistence: boolean;
}

export async function getWabaDashboard(scopeTenantId: string | null): Promise<DashboardView> {
  const s = await prisma.appSetting.findUnique({
    where: appSettingWhere(scopeTenantId) as Prisma.AppSettingWhereUniqueInput,
    select: {
      wabaAccessTokenEnc: true,
      wabaPhoneNumberId: true,
      wabaBusinessAccountId: true,
      wabaIsOnBizApp: true,
      wabaDashboard: true,
    },
  });

  const connected = Boolean(s?.wabaAccessTokenEnc && s.wabaPhoneNumberId && s.wabaBusinessAccountId);
  const snapshot = (s?.wabaDashboard ?? null) as WabaSnapshot | null;

  return {
    connected,
    fetchedAt: snapshot?.fetchedAt ? formatIST(new Date(snapshot.fetchedAt)) : null,
    stale: snapshotIsStale(snapshot?.fetchedAt),
    window:
      snapshot?.windowFrom && snapshot.windowTo
        ? { from: formatIST(new Date(snapshot.windowFrom)), to: formatIST(new Date(snapshot.windowTo)) }
        : null,
    snapshot,
    coexistence: s?.wabaIsOnBizApp === true,
  };
}

import "server-only";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { wabaVisible } from "@/lib/nurture/waba-visible";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import {
  automationBookingTypes,
  listAutomationRuns,
  listAutomations,
} from "@/features/automation/data";
import type { AutomationRow, AutomationRunRow } from "@/features/automation/types";

/** Everything the automation screen needs, so /admin and /w stay thin wrappers. */
export interface AutomationPageProps {
  automations: AutomationRow[];
  runs: AutomationRunRow[];
  bookingTypes: { id: string; label: string }[];
  showWaba: boolean;
  /** Whether this workspace has connected Zoom, which is what offers the step. */
  zoomConnected: boolean;
  zoomEmail: string | null;
  /** False until the platform owner has entered the Zoom app credentials. */
  zoomAppConfigured: boolean;
  /** True in the platform scope, where those credentials are editable. */
  isPlatform: boolean;
  canEdit: boolean;
}

export async function automationPageProps(): Promise<AutomationPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const [automations, runs, bookingTypes, showWaba, zoom, platformSetting] = await Promise.all([
    listAutomations(tenantId),
    listAutomationRuns(tenantId),
    automationBookingTypes(tenantId),
    wabaVisible(tenantId),
    prisma.zoomAccount.findUnique({ where: { tenantId }, select: { zoomEmail: true } }),
    // The Zoom app is the PLATFORM's, so this reads the platform row whichever workspace
    // is being looked at: a tenant needs to know whether there is anything to connect
    // to, without being able to see or set the credentials.
    prisma.appSetting.findUnique({
      where: appSettingWhere(null) as Prisma.AppSettingWhereUniqueInput,
      select: { zoomClientId: true, zoomClientSecretEnc: true },
    }),
  ]);
  return {
    automations,
    runs,
    bookingTypes,
    showWaba,
    zoomConnected: !!zoom,
    zoomEmail: zoom?.zoomEmail ?? null,
    zoomAppConfigured: !!platformSetting?.zoomClientId && !!platformSetting?.zoomClientSecretEnc,
    isPlatform: isPlatformScope(tenantId),
    canEdit: scope.canEdit,
  };
}

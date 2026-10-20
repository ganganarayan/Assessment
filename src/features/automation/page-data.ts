import "server-only";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { wabaVisible } from "@/lib/nurture/waba-visible";
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
  canEdit: boolean;
}

export async function automationPageProps(): Promise<AutomationPageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const [automations, runs, bookingTypes, showWaba] = await Promise.all([
    listAutomations(tenantId),
    listAutomationRuns(tenantId),
    automationBookingTypes(tenantId),
    wabaVisible(tenantId),
  ]);
  return { automations, runs, bookingTypes, showWaba, canEdit: scope.canEdit };
}

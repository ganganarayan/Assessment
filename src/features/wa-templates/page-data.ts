import "server-only";
import { resolveActingScope, configTenantOf } from "@/lib/tenant/acting";
import { resolveWabaConfig } from "@/lib/settings/config";
import { listWaTemplates } from "@/features/wa-templates/data";
import type { WaTemplateRow } from "@/features/wa-templates/types";

/** Everything the templates screen needs, so /admin and /w stay thin wrappers. */
export interface WaTemplatePageProps {
  templates: WaTemplateRow[];
  /**
   * Whether this workspace can reach Meta at all. Drafting works without it - writing
   * a template is useful before the number is connected - but submitting does not, and
   * the screen says which of the two is missing rather than failing at the click.
   */
  hasBusinessAccountId: boolean;
  hasToken: boolean;
  canEdit: boolean;
}

export async function waTemplatePageProps(): Promise<WaTemplatePageProps> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const [templates, waba] = await Promise.all([
    listWaTemplates(tenantId),
    resolveWabaConfig(tenantId),
  ]);
  return {
    templates,
    hasBusinessAccountId: !!waba.businessAccountId,
    hasToken: !!waba.accessToken,
    canEdit: scope.canEdit,
  };
}

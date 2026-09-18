import { getNurtureSettings, getNurtureLogs } from "@/features/nurture/actions";
import { actingTenantId } from "@/lib/tenant/acting";
import { NurtureComposer } from "@/features/nurture/components/nurture-composer";

export const dynamic = "force-dynamic";

/**
 * Nurture: the one-shot Email + WhatsApp that fire when a lead opts in. Follows the
 * acting scope (platform/Gita in the global view, the entered tenant while
 * impersonating). Connection creds are set in Settings; this page is the messages.
 */
export default async function NurturePage() {
  const [settings, logs, actingId] = await Promise.all([
    getNurtureSettings(),
    getNurtureLogs(),
    actingTenantId(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Nurture {actingId ? "(this tenant)" : "(platform · Gita)"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One email + one WhatsApp, sent once the moment a lead opts in. Everything after that lives in
          your CRM.
        </p>
      </div>

      <NurtureComposer initialConfig={settings.config} initialLogs={logs} />
    </div>
  );
}

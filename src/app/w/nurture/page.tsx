import { getNurtureSettings, getNurtureLogs } from "@/features/nurture/actions";
import { NurtureComposer } from "@/features/nurture/components/nurture-composer";
import { requireWorkspace } from "@/lib/auth/guards";

export const dynamic = "force-dynamic";

/**
 * Workspace Nurture - the one-shot Email + WhatsApp that fire when a lead opts in,
 * same as /admin/nurture but scoped to this workspace. The actions resolve through
 * the acting scope, so a tenant admin edits their own messages and logs.
 *
 * Connection credentials (SMTP, WhatsApp Cloud) live in Settings; this page is the
 * messages themselves. Not plan-gated - a workspace that has configured its own
 * sender should be able to use it.
 */
export default async function WorkspaceNurturePage() {
  await requireWorkspace();
  const [settings, logs] = await Promise.all([getNurtureSettings(), getNurtureLogs()]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Nurture</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One email + one WhatsApp, sent once the moment a lead opts in. Everything after that
          lives in your CRM.
        </p>
      </div>

      <NurtureComposer initialConfig={settings.config} initialLogs={logs} />
    </div>
  );
}

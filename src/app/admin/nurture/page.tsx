import { getNurtureSettings, getNurtureLogs } from "@/features/nurture/actions";
import { actingTenantId } from "@/lib/tenant/acting";
import { NurtureComposer } from "@/features/nurture/components/nurture-composer";
import { WelcomeEmailForm } from "@/features/admin/components/welcome-email-form";
import {
  getWelcomeEmail,
  type WelcomeEmailView,
} from "@/features/admin/actions/platform-integrations";

/** Placeholder for the tenant scope, where the welcome editor is not rendered. */
const EMPTY_WELCOME: WelcomeEmailView = {
  enabled: false,
  subject: "",
  body: "",
  defaultSubject: "",
  defaultBody: "",
};

export const dynamic = "force-dynamic";

/**
 * Nurture: the one-shot Email + WhatsApp that fire when a lead opts in. Follows the
 * acting scope (the platform in the global view, the entered tenant while
 * impersonating). Connection creds are set in Settings; this page is the messages.
 */
export default async function NurturePage() {
  const actingId = await actingTenantId();
  const [settings, logs, welcome] = await Promise.all([
    getNurtureSettings(),
    getNurtureLogs(),
    actingId ? Promise.resolve(EMPTY_WELCOME) : getWelcomeEmail(),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">
          Nurture {actingId ? "(this tenant)" : "(platform)"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One email + one WhatsApp, sent once the moment a lead opts in. Everything after that lives in
          your CRM.
        </p>
      </div>

      <NurtureComposer initialConfig={settings.config} initialLogs={logs} />

      {/* Platform scope only: this is the product writing to its own new customer, not
          a tenant writing to a respondent. It has no meaning inside a tenant. */}
      {actingId ? null : (
        <section className="flex flex-col gap-3 border-t pt-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Welcome email (new workspaces)</h2>
            <p className="text-sm text-[var(--muted-foreground)]">
              Sent once, to the person, the moment their workspace is created at signup. Their
              login address, the link into the workspace, and how to get started.
            </p>
          </div>
          <WelcomeEmailForm initial={welcome} />
        </section>
      )}
    </div>
  );
}

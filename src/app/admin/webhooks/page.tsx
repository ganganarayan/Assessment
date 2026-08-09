import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";
import { ACTIVE_EVENT_TYPES, EVENT_LABEL, DEFAULT_EVENT_NAME } from "@/features/events/types";
import { actingTenantId } from "@/lib/tenant/acting";
import { getPasswordResetWebhook } from "@/features/admin/actions/platform-integrations";
import { PasswordResetWebhookForm } from "@/features/admin/components/password-reset-webhook-form";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  // Scope to the entered tenant when impersonating; null = platform/Gita.
  const actingId = await actingTenantId();
  const { active, inactive } = await getWebhooks(actingId);
  // Password reset is a PLATFORM-level auth webhook (login is platform-wide), so it's
  // shown only in the platform view (not while impersonating a tenant).
  const resetHook = actingId === null ? await getPasswordResetWebhook() : null;
  // Trigger options: every event the app emits, with a friendly label + a suggested
  // default delivered name. Computed server-side so the client never imports the
  // event registry (which pulls @prisma/client). Multiple webhooks may share a
  // trigger (e.g. several CRMs), so triggers are NOT filtered by what exists.
  const triggers = ACTIVE_EVENT_TYPES.map((t) => ({
    value: t as string,
    label: EVENT_LABEL[t] ?? (t as string),
    defaultName: DEFAULT_EVENT_NAME[t] ?? (t as string),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          A webhook = a <strong>trigger</strong> (an app event) delivered under a name you choose for
          your CRM. Pick the trigger, name it dotted or underscore — your choice. Payloads are signed
          (HMAC-SHA256) in the <span className="font-mono">X-Assess-Signature</span> header. The name +
          URL are editable until the first successful delivery, then locked (create a new one to change).
        </p>
      </div>
      <WebhooksManager active={active} inactive={inactive} triggers={triggers} />

      {resetHook ? (
        <Card>
          <CardHeader>
            <CardTitle>Password reset webhook</CardTitle>
            <CardDescription>
              Platform-wide. When someone uses “Forgot password”, assess360 POSTs the reset link
              (10-min expiry) to this URL — your CRM catches it and emails the user. Payload:
              <span className="font-mono"> {"{ type: \"password_reset\", email, name, reset_url, token }"}</span>.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PasswordResetWebhookForm initialUrl={resetHook.url} />
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

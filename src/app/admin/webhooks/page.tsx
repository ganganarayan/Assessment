import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";
import { ACTIVE_EVENT_TYPES, EVENT_LABEL, DEFAULT_EVENT_NAME } from "@/features/events/types";
import { actingTenantId } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  // Scope to the entered tenant when impersonating; null = platform/Gita.
  const { active, inactive } = await getWebhooks(await actingTenantId());
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
    </div>
  );
}

import { getWebhookEndpointsByEvent } from "@/features/events/data";
import { ALL_EVENT_TYPES, EVENT_NAME } from "@/features/events/types";
import {
  WebhooksManager,
  type WebhookRow,
} from "@/features/events/components/webhooks-manager";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const map = await getWebhookEndpointsByEvent();
  const rows: WebhookRow[] = ALL_EVENT_TYPES.map((t) => {
    const ep = map.get(t);
    return {
      event: t,
      name: EVENT_NAME[t],
      url: ep?.url ?? "",
      enabled: ep?.enabled ?? false,
      secret: ep?.secret ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          One endpoint per event. Payloads are signed (HMAC-SHA256) in the
          <span className="font-mono"> X-Assess-Signature</span> header.
        </p>
      </div>
      <WebhooksManager rows={rows} />
    </div>
  );
}

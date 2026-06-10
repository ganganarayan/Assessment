import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const { active, inactive } = await getWebhooks();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          A webhook is the event. Names are immutable and unique. Payloads are
          signed (HMAC-SHA256) in the
          <span className="font-mono"> X-Assess-Signature</span> header.
        </p>
      </div>
      <WebhooksManager active={active} inactive={inactive} />
    </div>
  );
}

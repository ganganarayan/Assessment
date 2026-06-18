import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";
import { EMITTED_EVENT_NAMES } from "@/features/events/types";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const { active, inactive } = await getWebhooks();
  // Only offer event names that the app emits AND aren't already registered
  // (names are unique). Computed server-side so the client never imports the
  // event registry (which pulls @prisma/client).
  const taken = new Set([...active, ...inactive].map((w) => w.name));
  const availableEventNames = EMITTED_EVENT_NAMES.filter((n) => !taken.has(n));

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
      <WebhooksManager
        active={active}
        inactive={inactive}
        availableEventNames={availableEventNames}
      />
    </div>
  );
}

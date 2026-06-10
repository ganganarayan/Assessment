import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";
import { ACTIVE_EVENT_TYPES, EVENT_NAME } from "@/features/events/types";
import { buildSamplePayload } from "@/lib/events/payload";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const { active, inactive } = await getWebhooks();

  // Sample payloads for the read-only preview — built from the SAME assembler
  // that emits real events, so the preview can never drift from production.
  const samples: Record<string, string> = {};
  for (const type of ACTIVE_EVENT_TYPES) {
    const name = EVENT_NAME[type];
    const sample = buildSamplePayload(name, env.NEXT_PUBLIC_APP_URL);
    if (sample) samples[name] = JSON.stringify(sample, null, 2);
  }

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
      <WebhooksManager active={active} inactive={inactive} samples={samples} />
    </div>
  );
}

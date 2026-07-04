import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { getWebhooks } from "@/features/events/data";
import { WebhooksManager } from "@/features/events/components/webhooks-manager";
import { ACTIVE_EVENT_TYPES, EVENT_LABEL, DEFAULT_EVENT_NAME } from "@/features/events/types";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function WorkspaceWebhooksPage() {
  const { tenantId } = await requireWorkspace();
  const { active, inactive } = await getWebhooks(tenantId);
  const triggers = ACTIVE_EVENT_TYPES.map((t) => ({
    value: t as string,
    label: EVENT_LABEL[t] ?? (t as string),
    defaultName: DEFAULT_EVENT_NAME[t] ?? (t as string),
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Webhooks</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            Fire your CRM on assessment events. Private to this workspace — payloads are
            signed (HMAC-SHA256) in the <span className="font-mono">X-Assess-Signature</span> header.
          </p>
        </div>
        <Link href="/w/webhooks/logs" className={buttonVariants({ variant: "outline", size: "sm" })}>
          Delivery logs →
        </Link>
      </div>
      <WebhooksManager active={active} inactive={inactive} triggers={triggers} />
    </div>
  );
}

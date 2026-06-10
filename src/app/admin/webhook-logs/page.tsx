import Link from "next/link";
import { listWebhookLogs } from "@/features/events/data";
import {
  WebhookLogsTable,
  type WebhookLogRow,
} from "@/features/events/components/webhook-logs-table";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function WebhookLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const { rows, total } = await listWebhookLogs({ page, pageSize: PAGE_SIZE });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const data: WebhookLogRow[] = rows.map((r) => ({
    id: r.id,
    eventName: r.eventName,
    endpoint: r.endpoint,
    responseStatus: r.responseStatus,
    success: r.success,
    attemptCount: r.attemptCount,
    error: r.error,
    createdAt: r.createdAt.toISOString(),
    payload: JSON.stringify(r.payload, null, 2),
    responseBody: r.responseBody,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Webhook Logs</h1>
        <span className="text-sm text-[var(--muted-foreground)]">{total} total</span>
      </div>

      <WebhookLogsTable rows={data} />

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--muted-foreground)]">
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={`/admin/webhook-logs?page=${page - 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={`/admin/webhook-logs?page=${page + 1}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

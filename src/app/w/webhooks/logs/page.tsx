import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { listEventActivity } from "@/features/events/data";
import { WebhookLogsTable } from "@/features/events/components/webhook-logs-table";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function WorkspaceWebhookLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const { rows, total } = await listEventActivity({ page, pageSize: PAGE_SIZE, tenantId });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const pageHref = (p: number) => `/w/webhooks/logs?page=${p}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <Link href="/w/webhooks" className="text-sm underline">
            ← Webhooks
          </Link>
          <h1 className="text-2xl font-bold tracking-tight">Delivery logs</h1>
        </div>
        <span className="text-sm text-[var(--muted-foreground)]">{total} total</span>
      </div>

      <WebhookLogsTable rows={rows} />

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--muted-foreground)]">Page {page} of {pages}</span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={pageHref(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={pageHref(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

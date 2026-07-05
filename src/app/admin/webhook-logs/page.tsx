import Link from "next/link";
import { listEventActivity, listCrmSendLogs } from "@/features/events/data";
import { WebhookLogsTable } from "@/features/events/components/webhook-logs-table";
import { buttonVariants } from "@/components/ui/button";
import { actingTenantId } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;

export default async function WebhookLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);
  const view = sp.view === "crm" ? "crm" : "lifecycle";

  const { rows, total } =
    view === "crm"
      ? await listCrmSendLogs({ page, pageSize: PAGE_SIZE })
      : await listEventActivity({ page, pageSize: PAGE_SIZE, tenantId: await actingTenantId() });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const tab = (key: "lifecycle" | "crm", label: string) => (
    <Link
      href={`/admin/webhook-logs?view=${key}`}
      className={buttonVariants({ variant: view === key ? "default" : "outline", size: "sm" })}
    >
      {label}
    </Link>
  );

  const pageHref = (p: number) => `/admin/webhook-logs?view=${view}&page=${p}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Webhook Logs</h1>
        <span className="text-sm text-[var(--muted-foreground)]">{total} total</span>
      </div>

      <div className="flex gap-2">
        {tab("lifecycle", "Lifecycle webhooks")}
        {tab("crm", "CRM sends")}
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

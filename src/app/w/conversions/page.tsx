import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { countCapiLogs, listCapiLogs } from "@/features/events/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const PER_PAGE = 50;

/**
 * Read-only per-tenant conversions log. Firing to Meta stays a platform action for now -
 * a tenant's own pixel/CAPI-token wiring is the flagged live-money follow-up.
 *
 * 🟡 DEFAULTS TO PAYMENTS. The CAPI log holds every event the funnel fires - the opt-in
 * (CompleteRegistration), the completion, and the Purchase - so an unfiltered list shows
 * a contact who opted in and then completed as two rows, under a heading that says
 * "payments". That read as duplicated payment records. Payments are the default view and
 * the full log is one click away, because the full log is what you want when debugging
 * why an event did not reach Meta.
 *
 * Both tab counts are always queried, not just the active one: the number next to the
 * inactive tab is the whole reason the split is legible ("5 payments out of 68 events"),
 * and it is what makes the repeated contacts under All events read as separate events
 * rather than as duplicates.
 */
export default async function WorkspaceConversionsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string; page?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const { event, page } = await searchParams;
  const showAll = event === "all";
  const only = showAll ? undefined : ("payments" as const);

  const [payments, all] = await Promise.all([
    countCapiLogs(tenantId, { only: "payments" }),
    countCapiLogs(tenantId),
  ]);
  const total = showAll ? all : payments;

  // Clamp rather than trust the URL: a hand-edited or stale ?page (a bookmark from when
  // there were more rows) would otherwise render an empty table with no explanation.
  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const skip = (current - 1) * PER_PAGE;

  const rows = await listCapiLogs(tenantId, { take: PER_PAGE, skip, only });

  const href = (p: number) => {
    const qs = new URLSearchParams();
    if (showAll) qs.set("event", "all");
    if (p > 1) qs.set("page", String(p));
    const s = qs.toString();
    return s ? `/w/conversions?${s}` : "/w/conversions";
  };

  const first = total === 0 ? 0 : skip + 1;
  const last = skip + rows.length;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversions</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {showAll
            ? "Every Meta conversion event fired for your assessments - opt-ins and completions as well as payments. One row per event, so a contact appears more than once."
            : "Captured payments on your assessments and their Meta conversion status - private to this workspace."}
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/w/conversions"
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm",
            !showAll ? "border-[var(--primary)] font-medium" : "text-[var(--muted-foreground)]",
          )}
        >
          Payments <span className="tabular-nums">({payments})</span>
        </Link>
        <Link
          href="/w/conversions?event=all"
          className={cn(
            "rounded-md border px-3 py-1.5 text-sm",
            showAll ? "border-[var(--primary)] font-medium" : "text-[var(--muted-foreground)]",
          )}
        >
          All events <span className="tabular-nums">({all})</span>
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Event</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2 text-center">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-3 py-6 text-center text-[var(--muted-foreground)]">
                  {showAll ? "No conversion events yet." : "No payments yet."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">{r.name ?? "-"}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.email ?? r.phone ?? "-"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.eventName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.amountRupees != null ? `₹${r.amountRupees}` : "-"}
                  </td>
                  <td className="px-3 py-2 text-center">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-foreground)] tabular-nums">
          {total === 0 ? "Nothing to show" : `Showing ${first}-${last} of ${total}`}
        </p>
        {pages > 1 ? (
          <div className="flex items-center gap-2">
            {current > 1 ? (
              <Link href={href(current - 1)} className="rounded-md border px-3 py-1.5 text-sm">
                ← Newer
              </Link>
            ) : (
              <span className="rounded-md border px-3 py-1.5 text-sm text-[var(--muted-foreground)] opacity-50">
                ← Newer
              </span>
            )}
            <span className="text-xs text-[var(--muted-foreground)] tabular-nums">
              Page {current} of {pages}
            </span>
            {current < pages ? (
              <Link href={href(current + 1)} className="rounded-md border px-3 py-1.5 text-sm">
                Older →
              </Link>
            ) : (
              <span className="rounded-md border px-3 py-1.5 text-sm text-[var(--muted-foreground)] opacity-50">
                Older →
              </span>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

import Link from "next/link";
import { requireWorkspace } from "@/lib/auth/guards";
import { listCapiLogs } from "@/features/events/data";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Read-only per-tenant conversions log. Firing to Meta stays a platform action for now —
 * a tenant's own pixel/CAPI-token wiring is the flagged live-money follow-up.
 *
 * 🟡 DEFAULTS TO PAYMENTS. The CAPI log holds every event the funnel fires — the opt-in
 * (CompleteRegistration), the completion, and the Purchase — so an unfiltered list shows
 * a contact who opted in and then completed as two rows, under a heading that says
 * "payments". That read as duplicated payment records. Payments are the default view and
 * the full log is one click away, because the full log is what you want when debugging
 * why an event did not reach Meta.
 */
export default async function WorkspaceConversionsPage({
  searchParams,
}: {
  searchParams: Promise<{ event?: string }>;
}) {
  const { tenantId } = await requireWorkspace();
  const { event } = await searchParams;
  const showAll = event === "all";
  const rows = await listCapiLogs(tenantId, 200, "assessment", showAll ? undefined : "payments");

  const tab = (href: string, label: string, active: boolean) => (
    <Link
      href={href}
      className={cn(
        "rounded-md border px-3 py-1.5 text-sm",
        active ? "border-[var(--primary)] font-medium" : "text-[var(--muted-foreground)]",
      )}
    >
      {label}
    </Link>
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversions</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {showAll
            ? "Every Meta conversion event fired for your assessments — opt-ins and completions as well as payments. One row per event, so a contact appears more than once."
            : "Captured payments on your assessments and their Meta conversion status — private to this workspace."}
        </p>
      </div>

      <div className="flex gap-2">
        {tab("/w/conversions", "Payments", !showAll)}
        {tab("/w/conversions?event=all", "All events", showAll)}
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
                      <span className="font-medium">{r.name ?? "—"}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.email ?? r.phone ?? "—"}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{r.eventName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.amountRupees != null ? `₹${r.amountRupees}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center">{r.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

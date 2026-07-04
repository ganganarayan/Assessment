import { requireWorkspace } from "@/lib/auth/guards";
import { listCapiLogs } from "@/features/events/data";

export const dynamic = "force-dynamic";

/** Read-only per-tenant conversions log (their captured payments + Meta CAPI status).
 *  Firing to Meta stays a platform action for now — a tenant's own pixel/CAPI-token
 *  wiring is the flagged live-money follow-up. */
export default async function WorkspaceConversionsPage() {
  const { tenantId } = await requireWorkspace();
  const rows = await listCapiLogs(tenantId, 200);

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Conversions</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Captured payments on your assessments and their Meta conversion status — private
          to this workspace.
        </p>
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
                  No conversions yet.
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

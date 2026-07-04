import { requireWorkspace } from "@/lib/auth/guards";
import { listContacts } from "@/features/admin/data/analytics";
import { formatIST } from "@/lib/date";

export const dynamic = "force-dynamic";

/** Read-only, tenant-scoped contacts view for the workspace (no cross-tenant deletes
 *  — the admin ContactsTable's delete is super-admin only and unscoped). */
export default async function WorkspaceContactsPage() {
  const { tenantId } = await requireWorkspace();
  const { rows, total } = await listContacts({ page: 1, pageSize: 200, tenantId });

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {total} lead{total === 1 ? "" : "s"} — private to this workspace.
        </p>
      </div>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Contact</th>
              <th className="whitespace-nowrap px-3 py-2">Opt-in (IST)</th>
              <th className="px-3 py-2 text-center">Completed</th>
              <th className="px-3 py-2 text-center">Paid</th>
              <th className="px-3 py-2 text-center">VSL</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-[var(--muted-foreground)]">
                  No leads yet.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id}>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span className="font-medium">
                        {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.email ?? "—"}</span>
                      <span className="text-xs text-[var(--muted-foreground)]">{r.mobile ?? "—"}</span>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                    {formatIST(r.createdAt)}
                  </td>
                  <td className="px-3 py-2 text-center">{r.completed ? "✓" : "—"}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {r.paidAmount != null ? `₹${r.paidAmount}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{r.vslLoads}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

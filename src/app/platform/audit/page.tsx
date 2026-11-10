import Link from "next/link";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listAuditRows } from "@/features/platform/audit-data";
import { formatIST } from "@/lib/date";

export const dynamic = "force-dynamic";

/**
 * The audit log: who entered which workspace, granted which plan, changed which limits,
 * suspended, deleted or reset a password. Read-only, newest first.
 *
 * ?tenant=<id> narrows it to one workspace, which is what the tenant link in each row
 * does. A permanently deleted workspace still shows here, by id: the log does not hang
 * off the tenant row, precisely so the record of the delete survives the delete.
 */
export default async function PlatformAuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireSuperAdmin();
  const sp = await searchParams;
  const tenant = typeof sp.tenant === "string" && sp.tenant.trim() ? sp.tenant.trim() : null;
  const rows = await listAuditRows({ tenantId: tenant });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit log</h1>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Every owner action on a workspace or a login: entering, plan grants, limit changes, suspending,
          deleting, password resets and staff changes. Newest first, times in IST.
        </p>
        {tenant ? (
          <p className="mt-2 text-sm">
            Showing one workspace only.{" "}
            <Link href="/platform/audit" className="underline">
              Show everything
            </Link>
          </p>
        ) : null}
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border p-4 text-sm text-[var(--muted-foreground)]">Nothing recorded yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">When</th>
                <th className="px-3 py-2">Who</th>
                <th className="px-3 py-2">What</th>
                <th className="px-3 py-2">Workspace</th>
                <th className="px-3 py-2">Detail</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">{formatIST(r.createdAt)}</td>
                  <td className="px-3 py-2 text-xs">{r.actorEmail}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.action}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.tenantId ? (
                      <Link href={`/platform/audit?tenant=${encodeURIComponent(r.tenantId)}`} className="underline">
                        {r.tenantName ?? `${r.tenantId} (deleted)`}
                      </Link>
                    ) : (
                      <span className="text-[var(--muted-foreground)]">-</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{r.summary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}

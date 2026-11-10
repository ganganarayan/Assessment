import "server-only";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";

export interface AuditRow {
  id: string;
  createdAt: Date;
  actorEmail: string;
  action: string;
  tenantId: string | null;
  /** The workspace's name now, or null when it has been permanently deleted. */
  tenantName: string | null;
  summary: string;
}

/**
 * The newest audit rows, optionally for one workspace. Super admin only, and guarded
 * here rather than only on the page, so nothing else can import it as a backdoor.
 *
 * Names are looked up afresh rather than stored, so a renamed workspace reads as its
 * current name; a purged one keeps its id and the slug its purge line recorded.
 */
export async function listAuditRows(opts: { tenantId?: string | null; take?: number } = {}): Promise<AuditRow[]> {
  await requireSuperAdmin();
  const rows = await prisma.auditLog.findMany({
    where: opts.tenantId ? { tenantId: opts.tenantId } : {},
    orderBy: { createdAt: "desc" },
    take: Math.min(Math.max(opts.take ?? 300, 1), 1000),
    select: { id: true, createdAt: true, actorEmail: true, action: true, tenantId: true, summary: true },
  });
  const ids = [...new Set(rows.map((r) => r.tenantId).filter((v): v is string => !!v))];
  const tenants = ids.length
    ? await prisma.tenant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
    : [];
  const names = new Map(tenants.map((t) => [t.id, t.name]));
  return rows.map((r) => ({ ...r, tenantName: r.tenantId ? (names.get(r.tenantId) ?? null) : null }));
}

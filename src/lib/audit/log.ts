import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

/**
 * The actions the audit log records. A closed list so the screen can label and filter
 * them, and so a typo cannot invent a new kind of event nobody looks for.
 */
export type AuditAction =
  | "tenant.enter"
  | "tenant.create"
  | "tenant.delete"
  | "tenant.restore"
  | "tenant.purge"
  | "tenant.suspend"
  | "tenant.unsuspend"
  | "tenant.unlimited"
  | "tenant.payments"
  | "plan.grant"
  | "plan.limits"
  | "user.assign"
  | "user.superadmin"
  | "user.delete"
  | "user.restore"
  | "user.password"
  | "staff.create"
  | "staff.permission"
  | "staff.remove"
  | "agency.client.create"
  | "agency.client.remove"
  | "agency.client.restore";

export interface AuditEntry {
  actor: { id?: string | null; email: string };
  action: AuditAction;
  tenantId?: string | null;
  targetType?: string;
  targetId?: string;
  summary: string;
  detail?: Record<string, unknown>;
}

/**
 * Record one action. NEVER throws: an audit row that cannot be written is logged to the
 * server and the action it describes carries on. A delete that fails because its audit
 * line failed would be the log getting in the way of the thing it watches.
 *
 * Call it AFTER the action has succeeded, so the log never claims something happened
 * that did not.
 */
export async function audit(e: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: e.actor.id ?? null,
        actorEmail: e.actor.email,
        action: e.action,
        tenantId: e.tenantId ?? null,
        targetType: e.targetType ?? null,
        targetId: e.targetId ?? null,
        summary: e.summary.slice(0, 1000),
        detail: e.detail ? (e.detail as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    });
  } catch (err) {
    console.error(`[audit] ${e.action} not recorded:`, err instanceof Error ? err.message : String(err));
  }
}

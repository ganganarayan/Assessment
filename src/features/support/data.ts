import "server-only";
import { type SupportKind, type SupportStatus, type SupportAuthorRole } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { resolveSupportRouting } from "@/lib/support/config";
import { PENDING_STATUSES } from "@/lib/support/model";

/**
 * Every READ this feature does. Pages call these; nothing here mutates.
 *
 * Both sides of the product read the same thread, so the shape a thread is served in is
 * defined once and the only difference is what is filtered out: a tenant never receives
 * an internal note, and the filter is applied HERE in the query rather than in the view.
 * A note hidden by a component is a note that is still in the payload.
 */

export interface RequestRow {
  id: string;
  number: number;
  kind: SupportKind;
  status: SupportStatus;
  topic: string;
  subject: string;
  tenantId: string;
  tenantName: string;
  createdAt: string;
  updatedAt: string;
  /** Message count, notes excluded, so the two sides see the same number. */
  messageCount: number;
  /** True when the other side has said something this side has not read. */
  unread: boolean;
}

export interface ThreadMessage {
  id: string;
  authorRole: SupportAuthorRole;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
  emailStatus: string | null;
  emailError: string | null;
  webhookStatus: string | null;
  webhookError: string | null;
  attachments: ThreadAttachment[];
}

export interface ThreadAttachment {
  id: string;
  filename: string;
  contentType: string;
  bytes: number;
}

export interface Thread {
  id: string;
  number: number;
  kind: SupportKind;
  status: SupportStatus;
  topic: string;
  subject: string;
  tenantId: string;
  tenantName: string;
  contactEmail: string;
  contactWhatsapp: string | null;
  createdByName: string | null;
  createdAt: string;
  firstResponseAt: string | null;
  forwardedAt: string | null;
  messages: ThreadMessage[];
  /** Attachments that came in with the original request (no message of their own). */
  requestAttachments: ThreadAttachment[];
}

const MESSAGE_SELECT = {
  id: true,
  authorRole: true,
  authorName: true,
  body: true,
  isInternal: true,
  createdAt: true,
  emailStatus: true,
  emailError: true,
  webhookStatus: true,
  webhookError: true,
  attachments: { select: { id: true, filename: true, contentType: true, bytes: true } },
} as const;

/**
 * How many threads of each kind are waiting on the platform, for the red badge.
 *
 * 🟡 Skipped entirely when the kind is not IN_APP. A badge in EMAIL mode would be
 * counting work that was handed to somebody else, which is the opposite of what the
 * switch is for, and in OFF mode it would be counting a queue that is closed.
 *
 * Soft-deleted tenants are excluded: a removed workspace must not keep a number lit on
 * the owner's rail forever.
 */
export async function supportPendingCounts(): Promise<Record<SupportKind, number>> {
  const routing = await resolveSupportRouting().catch(() => null);
  const wanted: SupportKind[] = [];
  if (routing?.support === "IN_APP") wanted.push("SUPPORT");
  if (routing?.onboarding === "IN_APP") wanted.push("ONBOARDING");
  if (wanted.length === 0) return { SUPPORT: 0, ONBOARDING: 0 };

  const rows = await prisma.supportRequest.groupBy({
    by: ["kind"],
    where: {
      kind: { in: wanted },
      status: { in: [...PENDING_STATUSES] },
      tenant: { deletedAt: null },
    },
    _count: { _all: true },
  });
  const out: Record<SupportKind, number> = { SUPPORT: 0, ONBOARDING: 0 };
  for (const r of rows) out[r.kind] = r._count._all;
  return out;
}

/**
 * How many of this tenant's threads have an answer they have not opened.
 *
 * The tenant gets the same badge the owner does, which is the parity rule: a reply
 * nobody is told about is a reply nobody reads, and the email can be missed.
 */
export async function tenantUnreadCount(tenantId: string, kind: SupportKind): Promise<number> {
  const rows = await prisma.supportRequest.findMany({
    where: { tenantId, kind },
    select: {
      lastSeenByTenantAt: true,
      messages: {
        where: { isInternal: false, authorRole: "PLATFORM" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  return rows.filter((r) => {
    const last = r.messages[0]?.createdAt;
    if (!last) return false;
    return !r.lastSeenByTenantAt || r.lastSeenByTenantAt < last;
  }).length;
}

/** Both kinds in one pass, for the workspace rail. */
export async function tenantUnreadCounts(tenantId: string): Promise<Record<SupportKind, number>> {
  const [support, onboarding] = await Promise.all([
    tenantUnreadCount(tenantId, "SUPPORT"),
    tenantUnreadCount(tenantId, "ONBOARDING"),
  ]);
  return { SUPPORT: support, ONBOARDING: onboarding };
}

/**
 * The list screen, for either side.
 *
 * `tenantId` null is the platform view (every workspace); set, it is one tenant's own.
 * One function so the two lists cannot drift into showing different counts for the same
 * rows, which is how "you have a reply" and an empty thread end up on screen together.
 */
export async function listRequests(kind: SupportKind, tenantId: string | null): Promise<RequestRow[]> {
  const rows = await prisma.supportRequest.findMany({
    where: { kind, ...(tenantId ? { tenantId } : { tenant: { deletedAt: null } }) },
    orderBy: [{ updatedAt: "desc" }],
    take: 200,
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      topic: true,
      subject: true,
      tenantId: true,
      createdAt: true,
      updatedAt: true,
      lastSeenByTenantAt: true,
      tenant: { select: { name: true } },
      _count: { select: { messages: { where: { isInternal: false } } } },
      messages: {
        where: { isInternal: false },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { createdAt: true, authorRole: true },
      },
    },
  });

  return rows.map((r) => {
    const last = r.messages[0];
    // Unread means different things on the two sides, and both are "the other side
    // spoke last and I have not looked since".
    const unread = tenantId
      ? !!last && last.authorRole === "PLATFORM" && (!r.lastSeenByTenantAt || r.lastSeenByTenantAt < last.createdAt)
      : !!last && last.authorRole === "TENANT";
    return {
      id: r.id,
      number: r.number,
      kind: r.kind,
      status: r.status,
      topic: r.topic,
      subject: r.subject,
      tenantId: r.tenantId,
      tenantName: r.tenant.name,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      messageCount: r._count.messages,
      unread,
    };
  });
}

/**
 * One thread.
 *
 * `scope` is the caller's authority, and it is a FILTER rather than a check performed
 * afterwards: a tenant scope cannot load another tenant's row at all, and never receives
 * an internal note in the payload.
 */
export async function getThread(
  id: string,
  scope: { tenantId: string } | { platform: true },
): Promise<Thread | null> {
  const tenantOnly = "tenantId" in scope;
  const r = await prisma.supportRequest.findFirst({
    where: { id, ...(tenantOnly ? { tenantId: scope.tenantId } : {}) },
    select: {
      id: true,
      number: true,
      kind: true,
      status: true,
      topic: true,
      subject: true,
      tenantId: true,
      contactEmail: true,
      contactWhatsapp: true,
      createdAt: true,
      firstResponseAt: true,
      forwardedAt: true,
      tenant: { select: { name: true } },
      createdBy: { select: { name: true } },
      messages: {
        where: tenantOnly ? { isInternal: false } : {},
        orderBy: { createdAt: "asc" },
        select: MESSAGE_SELECT,
      },
      attachments: {
        where: { messageId: null },
        select: { id: true, filename: true, contentType: true, bytes: true },
      },
    },
  });
  if (!r) return null;

  return {
    id: r.id,
    number: r.number,
    kind: r.kind,
    status: r.status,
    topic: r.topic,
    subject: r.subject,
    tenantId: r.tenantId,
    tenantName: r.tenant.name,
    contactEmail: r.contactEmail,
    contactWhatsapp: r.contactWhatsapp,
    createdByName: r.createdBy?.name ?? null,
    createdAt: r.createdAt.toISOString(),
    firstResponseAt: r.firstResponseAt?.toISOString() ?? null,
    forwardedAt: r.forwardedAt?.toISOString() ?? null,
    messages: r.messages.map((m) => ({
      id: m.id,
      authorRole: m.authorRole,
      authorName: m.authorName,
      body: m.body,
      isInternal: m.isInternal,
      createdAt: m.createdAt.toISOString(),
      emailStatus: m.emailStatus,
      emailError: m.emailError,
      webhookStatus: m.webhookStatus,
      webhookError: m.webhookError,
      attachments: m.attachments,
    })),
    requestAttachments: r.attachments,
  };
}

/** Whether this tenant has any thread at all of this kind. OFF keeps the menu for a
 *  tenant with a live conversation, and this is the question that decides it. */
export async function tenantHasRequests(tenantId: string, kind: SupportKind): Promise<boolean> {
  const n = await prisma.supportRequest.count({ where: { tenantId, kind } });
  return n > 0;
}

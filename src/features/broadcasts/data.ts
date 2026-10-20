import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { contactTenantOf } from "@/lib/contacts/upsert";
import { builderOptions } from "@/features/workflows/data";
import type { AudienceView, BroadcastListRow, BroadcastOptions, BroadcastView } from "@/features/broadcasts/types";

/** Reading broadcasts. */

function audienceView(raw: unknown): AudienceView {
  const a = (raw ?? {}) as Partial<AudienceView>;
  const arr = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
  return {
    assessmentIds: arr(a.assessmentIds),
    tagIds: arr(a.tagIds),
    bands: arr(a.bands),
    createdFrom: typeof a.createdFrom === "string" ? a.createdFrom : null,
    createdTo: typeof a.createdTo === "string" ? a.createdTo : null,
  };
}

export async function listBroadcasts(scopeTenantId: string | null): Promise<BroadcastListRow[]> {
  const tenantId = contactTenantOf(scopeTenantId);
  const rows = await prisma.broadcast.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      channel: true,
      status: true,
      totalCount: true,
      sentCount: true,
      scheduledAt: true,
      createdAt: true,
    },
  });
  return rows.map((b) => ({
    id: b.id,
    name: b.name,
    channel: b.channel,
    status: b.status,
    totalCount: b.totalCount,
    sentCount: b.sentCount,
    scheduledAt: b.scheduledAt ? formatIST(b.scheduledAt) : null,
    createdAt: formatIST(b.createdAt),
  }));
}

export async function getBroadcast(scopeTenantId: string | null, id: string): Promise<BroadcastView | null> {
  const tenantId = contactTenantOf(scopeTenantId);
  const b = await prisma.broadcast.findFirst({ where: { id, tenantId } });
  if (!b) return null;
  return {
    id: b.id,
    name: b.name,
    channel: b.channel,
    status: b.status,
    subject: b.subject ?? "",
    body: b.body ?? "",
    wabaTemplate: b.wabaTemplate ?? "",
    wabaLang: b.wabaLang,
    wabaVars: Array.isArray(b.wabaVars)
      ? (b.wabaVars as unknown[]).map((v) => (typeof v === "string" ? v : ""))
      : [],
    audience: audienceView(b.audience),
    // ISO for the input; the IST formatting is only for text people read.
    scheduledAt: b.scheduledAt ? b.scheduledAt.toISOString() : null,
    ratePerMinute: b.ratePerMinute,
    totalCount: b.totalCount,
    sentCount: b.sentCount,
    failedCount: b.failedCount,
    skippedCount: b.skippedCount,
    startedAt: b.startedAt ? formatIST(b.startedAt) : null,
    finishedAt: b.finishedAt ? formatIST(b.finishedAt) : null,
  };
}

/**
 * The dropdown contents, borrowed wholesale from the workflow builder.
 *
 * Reused rather than reimplemented because the two screens must agree about which
 * assessments and tags exist and whether WhatsApp can be sent at all - and the WhatsApp
 * rule in particular (released AND connected) is one somebody would otherwise get
 * subtly different in the second place they wrote it.
 */
export async function broadcastOptions(scopeTenantId: string | null): Promise<BroadcastOptions> {
  return builderOptions(scopeTenantId);
}

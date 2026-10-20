import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { contactTenantOf } from "@/lib/contacts/upsert";

/**
 * Who a broadcast goes to.
 *
 * The filter is defined ONCE, here, and used for both the count shown before sending
 * and the rows written when it is scheduled. Two implementations would eventually
 * disagree, and the place they would disagree is the number somebody read before
 * agreeing to message five thousand people.
 */

export interface AudienceFilter {
  /** Anybody who has a submission on one of these. Empty means any. */
  assessmentIds?: string[];
  /** Must carry ALL of these tags. Empty means any. */
  tagIds?: string[];
  /** Score bands on a submission. Empty means any. */
  bands?: string[];
  /** ISO instants. Contacts first seen within the window. */
  createdFrom?: string | null;
  createdTo?: string | null;
}

export type BroadcastChannelValue = "EMAIL" | "WABA";

/**
 * The query.
 *
 * 🔴 Two conditions are not negotiable and are not part of the filter the owner
 * chooses, because they are not preferences. Anybody who has opted out is excluded,
 * always. And a contact with no address on the channel being used is excluded, because
 * a recipient row that can only ever be skipped is a row that makes the count a lie.
 */
export function audienceWhere(
  tenantId: string,
  f: AudienceFilter,
  channel: BroadcastChannelValue,
): Prisma.ContactWhereInput {
  const tagIds = (f.tagIds ?? []).filter(Boolean);
  const assessmentIds = (f.assessmentIds ?? []).filter(Boolean);
  const bands = (f.bands ?? []).filter(Boolean);

  const submissionFilter: Prisma.SubmissionWhereInput = {
    ...(assessmentIds.length ? { assessmentId: { in: assessmentIds } } : {}),
    ...(bands.length ? { gateBand: { in: bands } } : {}),
  };

  return {
    tenantId,
    marketingOptOutAt: null,
    ...(channel === "WABA" ? { mobile: { not: null } } : { email: { not: null } }),
    // ALL of the chosen tags, not any: "tagged hot AND tagged india" is the useful
    // reading, and an OR is one careless click away from messaging everybody.
    ...(tagIds.length ? { AND: tagIds.map((id) => ({ tags: { some: { tagId: id } } })) } : {}),
    ...(Object.keys(submissionFilter).length ? { submissions: { some: submissionFilter } } : {}),
    ...(f.createdFrom || f.createdTo
      ? {
          createdAt: {
            ...(f.createdFrom ? { gte: new Date(f.createdFrom) } : {}),
            ...(f.createdTo ? { lte: new Date(f.createdTo) } : {}),
          },
        }
      : {}),
  };
}

/** How many people this would reach, right now. Shown before anything is scheduled. */
export async function countAudience(
  scopeTenantId: string | null,
  f: AudienceFilter,
  channel: BroadcastChannelValue,
): Promise<number> {
  const tenantId = contactTenantOf(scopeTenantId);
  return prisma.contact.count({ where: audienceWhere(tenantId, f, channel) });
}

/** How many rows one pass writes. Keeps a large audience off one enormous query. */
const PAGE = 500;

/**
 * Turn the filter into rows.
 *
 * 🔴 This is the moment the audience stops moving. From here the broadcast has a fixed
 * list, and somebody who opts in a minute later is not on it. That is the point: the
 * count somebody approved and the number of messages that go out are then the same
 * number, and "who did this reach" has an answer per person rather than a re-run query
 * that gives a different result every time it is asked.
 *
 * Idempotent, so a failure partway can be re-run: the unique key on
 * (broadcast, contact) means a second pass adds only what is missing.
 */
export async function materialiseAudience(broadcastId: string): Promise<number> {
  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { id: true, tenantId: true, channel: true, audience: true },
  });
  if (!b) return 0;

  const filter = (b.audience ?? {}) as AudienceFilter;
  const where = audienceWhere(b.tenantId, filter, b.channel);

  let cursor: string | undefined;
  let written = 0;
  for (;;) {
    const page = await prisma.contact.findMany({
      where,
      orderBy: { id: "asc" },
      take: PAGE,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      select: { id: true, email: true, mobile: true },
    });
    if (page.length === 0) break;

    const res = await prisma.broadcastRecipient.createMany({
      data: page.map((c) => ({
        broadcastId: b.id,
        contactId: c.id,
        tenantId: b.tenantId,
        toAddress: b.channel === "WABA" ? c.mobile : c.email,
      })),
      skipDuplicates: true,
    });
    written += res.count;
    cursor = page[page.length - 1]!.id;
    if (page.length < PAGE) break;
  }

  await prisma.broadcast.update({
    where: { id: b.id },
    data: { totalCount: await prisma.broadcastRecipient.count({ where: { broadcastId: b.id } }) },
  });
  return written;
}

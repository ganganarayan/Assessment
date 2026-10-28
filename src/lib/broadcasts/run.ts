import {
  heldForMissingValue,
  loadContactFields,
  resolveContactValues,
} from "@/lib/contacts/fields";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { featureAllowedFor } from "@/lib/features/release";
import { sendEmail, sendWaba } from "@/lib/nurture/send";
import { fillPlaceholders, toE164Digits } from "@/features/nurture/config";
import { isSuppressed, unsubscribeUrlFor } from "@/lib/contacts/dnd";
import { defaultCountryCodeFor } from "@/lib/contacts/upsert";
import { materialiseAudience } from "@/lib/broadcasts/audience";

/**
 * Sending a broadcast, slowly and on purpose.
 *
 * 🔴 THE RATE IS A SAFETY LIMIT, NOT A PERFORMANCE SETTING. A WhatsApp number is
 * tiered at 1K, 10K or 100K unique recipients per 24 hours with a per-second cap on
 * top, and the tier is not fixed: a burst of people blocking or reporting drops the
 * quality rating, and a dropped rating drops the tier. So the fastest way to send five
 * thousand messages is not to send them as fast as possible - it is to send them at a
 * rate that does not cost you the ability to send the next five thousand.
 *
 * One pass of this function sends at most ratePerMinute messages per broadcast, and
 * the pass is driven by a cron every minute. Nothing sleeps, nothing holds a timer:
 * the queue is rows, and whichever process is alive next continues it.
 */

export interface BroadcastOutcome {
  started: number;
  sent: number;
  failed: number;
  skipped: number;
  finished: number;
}

export async function runDueBroadcasts(now: Date = new Date()): Promise<BroadcastOutcome> {
  const out: BroadcastOutcome = { started: 0, sent: 0, failed: 0, skipped: 0, finished: 0 };

  // 1. Anything scheduled whose time has come. The recipients are written HERE rather
  //    than when the owner pressed schedule, so a list assembled days in advance is
  //    still accurate on the morning it goes - while staying fixed from that moment on.
  const due = await prisma.broadcast.findMany({
    where: { status: "SCHEDULED", scheduledAt: { lte: now } },
    select: { id: true, tenantId: true },
  });
  for (const b of due) {
    if (!(await featureAllowedFor("broadcasts", b.tenantId))) continue;
    const claim = await prisma.broadcast.updateMany({
      where: { id: b.id, status: "SCHEDULED" },
      data: { status: "SENDING", startedAt: now },
    });
    if (claim.count === 0) continue;
    await materialiseAudience(b.id);
    out.started++;
  }

  // 2. Drain what is sending, one broadcast at a time, capped per broadcast.
  const sending = await prisma.broadcast.findMany({
    where: { status: "SENDING" },
    select: {
      id: true,
      tenantId: true,
      channel: true,
      subject: true,
      body: true,
      wabaTemplate: true,
      wabaLang: true,
      wabaVars: true,
      ratePerMinute: true,
    },
  });

  for (const b of sending) {
    if (!(await featureAllowedFor("broadcasts", b.tenantId))) continue;

    const batch = await prisma.broadcastRecipient.findMany({
      where: { broadcastId: b.id, status: "PENDING" },
      take: Math.max(1, b.ratePerMinute),
      select: {
        id: true,
        toAddress: true,
        contact: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            mobile: true,
            profession: true,
            optOutToken: true,
            marketingOptOutAt: true,
          },
        },
      },
    });

    if (batch.length === 0) {
      await prisma.broadcast.update({
        where: { id: b.id },
        data: { status: "SENT", finishedAt: now },
      });
      out.finished++;
      continue;
    }

    const cc = await defaultCountryCodeFor(b.tenantId);
    // The registry once per batch, not once per recipient: it cannot change mid-send,
    // and a blast to five thousand people would otherwise run five thousand copies of
    // the same query.
    const fields = await loadContactFields(b.tenantId);

    for (const r of batch) {
      const c = r.contact;

      // 🔴 Suppression is re-checked at SEND time, not trusted from when the list was
      // built. A list assembled this morning and sent this afternoon has had half a day
      // in which somebody could unsubscribe, and the whole point of an unsubscribe is
      // that it takes effect before the next message rather than after it.
      const gone =
        c.marketingOptOutAt != null ||
        (await isSuppressed(b.tenantId, { email: c.email, mobile: c.mobile }));
      if (gone) {
        await prisma.broadcastRecipient.update({
          where: { id: r.id },
          data: { status: "SKIPPED", skipReason: "They unsubscribed before it went out." },
        });
        out.skipped++;
        continue;
      }

      const unsubscribeUrl = await unsubscribeUrlFor(b.tenantId, c.optOutToken);
      const resolved = fields.length
        ? await resolveContactValues(b.tenantId, c.id, fields)
        : { values: {}, holdKeys: [] };

      // 🔴 HELD, NOT SENT WITH A HOLE, the same rule the sequences use. It costs this
      // person the message, which is why the reason names the value: a blast that
      // skipped four hundred people without saying why would be indistinguishable from
      // a broken send.
      const held = heldForMissingValue(
        [
          b.subject,
          b.body,
          ...(Array.isArray(b.wabaVars) ? (b.wabaVars as unknown[]) : []).map((v) =>
            typeof v === "string" ? v : "",
          ),
        ],
        resolved,
      );
      if (held) {
        await prisma.broadcastRecipient.update({
          where: { id: r.id },
          data: { status: "SKIPPED", skipReason: `No ${held} for them yet.` },
        });
        out.skipped++;
        continue;
      }

      // The workspace's own values first, the engine's own placeholders on top, so
      // nothing a workspace declares can shadow the unsubscribe link.
      const extra = { ...resolved.values, unsubscribeUrl };
      let error: string | null = null;
      let to: string | null = null;

      if (b.channel === "EMAIL") {
        to = (c.email ?? "").trim() || null;
        error = to
          ? await sendEmail(
              b.tenantId,
              to,
              fillPlaceholders(b.subject ?? "", c, extra),
              fillPlaceholders(b.body ?? "", c, extra),
            )
          : "No email address.";
      } else {
        to = toE164Digits(c.mobile, cc);
        const vars = Array.isArray(b.wabaVars)
          ? (b.wabaVars as unknown[]).map((v) => fillPlaceholders(typeof v === "string" ? v : "", c, extra))
          : [];
        error = to
          ? await sendWaba(b.tenantId, to, b.wabaTemplate ?? "", b.wabaLang, vars)
          : "No usable mobile number.";
      }

      await prisma.broadcastRecipient.update({
        where: { id: r.id },
        data: {
          status: error ? "FAILED" : "SENT",
          toAddress: to,
          error: error?.slice(0, 500) ?? null,
          sentAt: error ? null : new Date(),
        },
      });
      if (error) out.failed++;
      else out.sent++;
    }

    // Tallies on the row, so the list screen does not count a million join rows.
    const [sent, failed, skipped] = await Promise.all([
      prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: "SENT" } }),
      prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: "FAILED" } }),
      prisma.broadcastRecipient.count({ where: { broadcastId: b.id, status: "SKIPPED" } }),
    ]);
    await prisma.broadcast.update({
      where: { id: b.id },
      data: { sentCount: sent, failedCount: failed, skippedCount: skipped },
    });
  }

  return out;
}

/**
 * Stop one mid-flight.
 *
 * The rows already sent stay sent - there is no recalling a message - and everything
 * still pending is marked so the log says plainly that it was stopped rather than
 * silently never sent.
 */
export async function cancelBroadcast(broadcastId: string): Promise<void> {
  await prisma.broadcastRecipient.updateMany({
    where: { broadcastId, status: "PENDING" },
    data: { status: "SKIPPED", skipReason: "The broadcast was stopped." },
  });
  await prisma.broadcast.update({
    where: { id: broadcastId },
    data: { status: "CANCELLED", finishedAt: new Date() },
  });
}

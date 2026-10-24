import "server-only";
import crypto from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { sendCapiEventVerbose } from "@/lib/meta/send";
import { META_EVENT_META } from "@/features/assessment/meta-events";
import { GATE_WAITLISTED_EVENT } from "@/features/assessment/schemas";

/**
 * Put three sample events on a workspace's pixel, the moment their Conversions API
 * token is saved.
 *
 * WHY THIS EXISTS, AND WHY IT IS WORTH THE COST. Meta is slow to show a new event:
 * Events Manager can take a couple of hours, and a custom audience built on an event it
 * has never seen cannot be created at all. So a setup call booked for tomorrow morning
 * arrives at an ad account with nothing in it, and the half of the call that is worth
 * most - building the exclusion audience from the people the gate turned away, and the
 * retargeting one from the people who qualified - cannot be done, because the events it
 * needs do not exist yet. Sending three now means they are there by the time anybody
 * joins the call. This is the single thing that decides whether those thirty minutes
 * produce a working ad account or a promise to finish it later.
 *
 * 🔴 THESE ARE REAL EVENTS, NOT TEST EVENTS. A test_event_code would confine them to
 * the Test Events tab, which never reaches Events Manager's aggregates and never
 * reaches a custom audience, so it would cost the same and buy nothing. The price of
 * that decision is three synthetic conversions in somebody's real ad account, which is
 * why everything below is built around sending them exactly once.
 *
 * 🔴 THE STAMP IS CLAIMED BEFORE ANYTHING IS SENT. Three guards, deliberately layered:
 *
 *  1. `capiSeededAt` is claimed with a conditional update, so two saves racing each
 *     other produce one winner and the loser sends nothing.
 *  2. The event ids are DETERMINISTIC, so even if a send somehow happened twice, Meta
 *     deduplicates on event_id and the account still sees three events.
 *  3. The stamp is released again only when all three sends failed, which is the one
 *     case where retrying is strictly better: a mistyped token, corrected.
 *
 * A crash between claiming and sending therefore loses the seeding rather than
 * duplicating it. That is the right way round: a missing seed is recoverable by hand
 * from the CAPI tester, and three extra conversions in a live ad account are not
 * recoverable at all.
 *
 * WHY NOTHING IS WRITTEN TO CapiLog. That table is purchase-shaped - a unique payment
 * id, an amount in paise - and it is read by the purchase endpoint that the browser
 * uses to deduplicate Meta Purchase events against amount bands. Three amount-less,
 * payment-less rows in it would be noise in a money-critical surface to gain a record
 * that Events Manager already holds, which is where anybody will look anyway.
 */

/** The seeded events, in the order they are sent and in the order they would happen. */
function seedEventNames(): [string, string, string] {
  /**
   * The gated completion name, from the builder's own table rather than a literal.
   *
   * `completion.event` is written for a human as "AssessmentCompleted /
   * QualifiedCompletion", because the funnel sends the second name when it is gated.
   * A gated funnel is what every one of these workspaces is being set up with, so the
   * last name is the right one to seed, and reading it from the table means a rename
   * there does not leave this file seeding an event nothing else fires.
   */
  const parts = META_EVENT_META.completion.event
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  const completion = parts[parts.length - 1] ?? "QualifiedCompletion";
  return [META_EVENT_META.gateDisqualified.event, GATE_WAITLISTED_EVENT, completion];
}

export interface SeedResult {
  /** How many of the three Meta accepted. */
  sent: number;
  names: string[];
}

/**
 * Seed, or do nothing and say so by returning null.
 *
 * Null covers every reason not to: already seeded, no settings row, or a race lost. The
 * caller treats all of them the same, because from the tenant's side they are the same:
 * nothing to report.
 *
 * Never throws. It is called from the middle of saving a token, and a workspace must not
 * lose its Conversions API token because Meta's edge was slow.
 */
export async function seedCapiEvents(tenantId: string): Promise<SeedResult | null> {
  try {
    // Claim it. `capiSeededAt: null` in the filter is the whole concurrency guard:
    // updateMany reports how many rows it changed, so the loser of a race sees 0.
    const claim = await prisma.appSetting.updateMany({
      where: { tenantId, capiSeededAt: null },
      data: { capiSeededAt: new Date() },
    });
    if (claim.count === 0) return null;

    const names = seedEventNames();
    const now = Date.now();
    /**
     * Twenty seconds back, ten back, now.
     *
     * The spacing is in event_time rather than in wall-clock delivery, which is the
     * difference between one request that cannot half-fail and three sends twenty
     * seconds apart inside a server action. Meta accepts a past event_time for days and
     * reports each event at the time given, so Events Manager shows three events a few
     * seconds apart, which is what a real respondent's run would look like. Holding a
     * request open for twenty seconds instead would mean a redeploy mid-wait lost two
     * of the three, and the deferred alternative is worse: this app's queue cron has
     * never been created, so anything enqueued may never fire at all.
     */
    const offsets = [20_000, 10_000, 0];

    // A stable, hashed, first-party id. Not the tenant id in the clear, and not a real
    // person: no email, no phone, nothing that could match an actual customer and teach
    // their ad account to look for people like a row in our database.
    const externalId = crypto
      .createHash("sha256")
      .update(`a360-seed:${tenantId}`)
      .digest("hex");

    let sent = 0;
    for (let i = 0; i < names.length; i++) {
      const eventName = names[i]!;
      const r = await sendCapiEventVerbose(
        {
          eventName,
          // Deterministic, so a duplicate send is deduplicated by Meta rather than by us.
          eventId: `a360-seed-${tenantId}-${eventName}`,
          eventTimeMs: now - offsets[i]!,
          eventSourceUrl: env.NEXT_PUBLIC_APP_URL,
          user: { externalId },
          customData: { seeded: "1" },
        },
        tenantId,
        null,
      );
      if (r.ok) sent++;
      else console.error(`[capi-seed] ${eventName} failed:`, r.error ?? r.response ?? r.status);
    }

    if (sent === 0) {
      // Nothing reached Meta, so nothing was spent and the only honest state is
      // unseeded: a token that was wrong and is then corrected should seed on the
      // second save. Releasing the stamp is safe precisely because sent === 0.
      await prisma.appSetting.updateMany({ where: { tenantId }, data: { capiSeededAt: null } });
      return null;
    }

    return { sent, names };
  } catch (e) {
    console.error("[capi-seed] threw:", e);
    return null;
  }
}

"use server";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { mergeWatch, watchTotals } from "@/features/assessment/watch/merge";

/**
 * Record how much of the result page's VSL this respondent has watched.
 *
 * Called from the result page when the VidaPulse player reports progress upward. See
 * docs/vidapulse-progress-contract.md for the message the player sends.
 *
 * 🔴 AUTHORISED BY THE RESULT TOKEN, nothing else.
 *
 * The token is the same capability that lets this person see the page at all, which is
 * exactly the right level: whoever can watch the video may report on their own watching
 * and nobody else's. Without it, a submission id - which is in a URL and therefore
 * guessable in shape - would be enough to write a completed watch onto somebody else's
 * lead, and the owner would walk into a call believing the person had seen the video.
 *
 * Fail-soft and silent: this is telemetry on a page the respondent is reading, and
 * nothing it can do is worth an error in front of them.
 */
export async function recordVslProgress(input: {
  submissionId: string;
  resultToken: string;
  sessionId: string;
  maxPct: number;
  watchedSeconds: number;
  duration?: number | null;
  /** What the figures describe. Absent = this visit, which is what the contract says. */
  scope?: "session" | "lifetime";
}): Promise<void> {
  try {
    const submissionId = (input.submissionId ?? "").trim().slice(0, 64);
    const resultToken = (input.resultToken ?? "").trim().slice(0, 128);
    const sessionId = (input.sessionId ?? "").trim().slice(0, 64);
    if (!submissionId || !resultToken || !sessionId) return;

    // The player reports on a heartbeat, so this is called repeatedly for one viewer.
    // Bounded per submission rather than globally: one person watching must never be
    // able to starve another's reports.
    if (!rateLimit(`vslwatch:${submissionId}`, 120)) return;

    const row = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, resultToken: true, vslWatchSessions: true, vslDuration: true },
    });
    // No token on the row means no shareable result exists, which is not a submission
    // anybody should be reporting watch time against.
    if (!row || !row.resultToken || row.resultToken !== resultToken) return;

    const sessions = mergeWatch(row.vslWatchSessions, {
      sessionId,
      pct: input.maxPct,
      secs: input.watchedSeconds,
      scope: input.scope === "lifetime" ? "lifetime" : "session",
    });
    const totals = watchTotals(sessions);

    // Duration comes from the player and should not move, but a longer value wins:
    // an early report can arrive before the metadata has loaded and read 0.
    const duration =
      typeof input.duration === "number" && Number.isFinite(input.duration) && input.duration > 0
        ? Math.max(row.vslDuration ?? 0, Math.round(input.duration * 10) / 10)
        : row.vslDuration;

    await prisma.submission.update({
      where: { id: submissionId },
      data: {
        vslWatchSessions: sessions as unknown as Prisma.InputJsonValue,
        vslMaxPct: totals.maxPct,
        vslWatchSeconds: totals.watchSeconds,
        ...(duration ? { vslDuration: duration } : {}),
      },
    });
  } catch {
    /* telemetry on a page somebody is reading - never surface a failure to them */
  }
}

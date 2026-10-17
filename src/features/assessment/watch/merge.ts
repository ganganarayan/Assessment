/**
 * How much of the VSL this respondent has actually watched, across every visit.
 *
 * WHY A MERGE AND NOT A NUMBER. VidaPulse counts per SESSION, not per person: every
 * load of the result page opens a new session starting at zero (its own aggregation is
 * `GREATEST(...) WHERE id = <session>`). So the figure arriving from the player is
 * "this visit", not "ever".
 *
 * 🔴 Storing it as-is would make the number FALL. Someone who watched twelve minutes
 * yesterday, reopens the emailed link today and leaves after twenty seconds, and the
 * row would read twenty seconds. A figure that can regress is worse than no figure,
 * because it is believed once and then never again.
 *
 * So each session is kept under its own id and the totals are derived: furthest point
 * is the max across sessions and can only rise, watch time is the sum across sessions
 * and cannot double-count, because a repeated report for a session REPLACES that
 * session's entry rather than adding to it.
 *
 * Pure and dependency-free, so scripts/verify-watch.ts can pin it.
 */

/** One viewing session, as far as it got. */
export interface WatchSession {
  /** Furthest point reached in this session, 0-100. */
  pct: number;
  /** Seconds actually watched in this session (excludes pauses and seeks). */
  secs: number;
  /** When this session was last reported, ISO. */
  at: string;
}

export type WatchSessions = Record<string, WatchSession>;

export interface WatchTotals {
  /** Furthest point reached in ANY session. Monotonic. */
  maxPct: number;
  /** Seconds watched across every session. */
  watchSeconds: number;
  /** How many separate visits watched some of it. */
  sessions: number;
}

/**
 * How many sessions to keep per submission.
 *
 * Unbounded would mean a reload loop (or a bot) growing one JSON column without
 * limit. The oldest are dropped first, which costs a little historical watch time on
 * somebody who has opened the page fifty times, and that person's totals are long past
 * the point where another decimal changes any decision.
 */
export const MAX_WATCH_SESSIONS = 50;

function clampPct(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  return Math.min(100, Math.max(0, Math.round(v * 10) / 10));
}

function clampSecs(n: unknown): number {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  // A day is far beyond any real video and stops a bad report poisoning the sum.
  return Math.min(86_400, Math.max(0, Math.round(v * 10) / 10));
}

/** Read whatever is on the row back into a usable map, discarding anything malformed. */
export function readWatchSessions(value: unknown): WatchSessions {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: WatchSessions = {};
  for (const [id, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const r = raw as Record<string, unknown>;
    const at = typeof r.at === "string" ? r.at : "";
    out[id.slice(0, 64)] = { pct: clampPct(r.pct), secs: clampSecs(r.secs), at };
  }
  return out;
}

/**
 * Fold one report into what is already stored.
 *
 * Within a session the stored values only ever rise, so a report that arrives late,
 * out of order, or after a seek backwards cannot pull the figure down.
 */
export function mergeWatch(
  existing: unknown,
  report: { sessionId: string; pct: number; secs: number; at?: string },
): WatchSessions {
  const sessions = readWatchSessions(existing);
  const id = (report.sessionId ?? "").trim().slice(0, 64);
  if (!id) return sessions;

  const prev = sessions[id];
  const next: WatchSession = {
    pct: Math.max(prev?.pct ?? 0, clampPct(report.pct)),
    secs: Math.max(prev?.secs ?? 0, clampSecs(report.secs)),
    at: report.at ?? new Date().toISOString(),
  };
  sessions[id] = next;

  const ids = Object.keys(sessions);
  if (ids.length > MAX_WATCH_SESSIONS) {
    // Oldest first, and the session being reported right now is never the one dropped.
    const ordered = ids
      .filter((k) => k !== id)
      .sort((a, b) => (sessions[a]!.at < sessions[b]!.at ? -1 : 1));
    for (const drop of ordered.slice(0, ids.length - MAX_WATCH_SESSIONS)) delete sessions[drop];
  }
  return sessions;
}

/** The two numbers anybody actually reads, derived rather than stored independently. */
export function watchTotals(sessions: WatchSessions): WatchTotals {
  const values = Object.values(sessions);
  return {
    maxPct: values.reduce((m, s) => Math.max(m, s.pct), 0),
    watchSeconds: Math.round(values.reduce((t, s) => t + s.secs, 0) * 10) / 10,
    sessions: values.length,
  };
}

/** "5:09" - minutes and seconds, for a figure a person reads. */
export function formatWatchClock(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem < 10 ? "0" : ""}${rem}`;
}

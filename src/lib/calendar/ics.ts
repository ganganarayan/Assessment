/**
 * iCalendar (RFC 5545) text for the calendar subscription feed and for the single-event
 * .ics a respondent downloads from their confirmation. PURE: strings in, string out, so
 * scripts/verify-calendar.ts can check the escaping without a server.
 *
 * Hand-rolled rather than a dependency, because the subset that matters is small and
 * the parts calendar clients are strict about are exactly the parts a library would hide:
 * CRLF line endings, a stable UID per event, and folding long lines at 75 octets. Apple
 * Calendar in particular drops an entire VEVENT rather than complaining.
 */

export interface IcsEvent {
  /** Stable per appointment, forever. A changed UID is a NEW event to every client,
   *  so a rescheduled call would appear twice rather than move. */
  uid: string;
  startMs: number;
  endMs: number;
  summary: string;
  description?: string | null;
  location?: string | null;
  /** CANCELLED keeps the event in the feed but strikes it through, which is how a
   *  client learns a call is off. Dropping the row instead leaves it in the diary. */
  status?: "CONFIRMED" | "CANCELLED";
  /** Bumped on every change, so a client accepts the newer copy. */
  sequence?: number;
  createdMs?: number;
  updatedMs?: number;
  organizerEmail?: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
}

/** "20261020T093000Z" - UTC, which is the only form every client reads the same way. */
function icsStamp(ms: number): string {
  return `${new Date(ms).toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
}

/** Escape a TEXT value per RFC 5545: backslash, semicolon, comma and newlines. */
function esc(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/**
 * Fold one content line to 75 octets, continuing with a leading space.
 *
 * Counted in OCTETS, not characters: a name or a note can hold anything, and a
 * multi-byte character split across a fold is what turns into mojibake or a dropped
 * event. So the measure is the UTF-8 length and a character is never cut in half.
 */
function fold(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const out: string[] = [];
  let current = "";
  let currentBytes = 0;
  let limit = 75;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (currentBytes + size > limit) {
      out.push(current);
      current = "";
      currentBytes = 0;
      limit = 74; // a continuation line spends one octet on its leading space
    }
    current += char;
    currentBytes += size;
  }
  if (current) out.push(current);
  return out.map((part, i) => (i === 0 ? part : ` ${part}`)).join("\r\n");
}

function vevent(event: IcsEvent): string[] {
  const lines = [
    "BEGIN:VEVENT",
    `UID:${event.uid}`,
    `DTSTAMP:${icsStamp(event.updatedMs ?? event.createdMs ?? Date.now())}`,
    `DTSTART:${icsStamp(event.startMs)}`,
    `DTEND:${icsStamp(event.endMs)}`,
    `SUMMARY:${esc(event.summary)}`,
    `STATUS:${event.status ?? "CONFIRMED"}`,
    `SEQUENCE:${event.sequence ?? 0}`,
  ];
  if (event.createdMs) lines.push(`CREATED:${icsStamp(event.createdMs)}`);
  if (event.updatedMs) lines.push(`LAST-MODIFIED:${icsStamp(event.updatedMs)}`);
  if (event.description) lines.push(`DESCRIPTION:${esc(event.description)}`);
  if (event.location) lines.push(`LOCATION:${esc(event.location)}`);
  if (event.organizerEmail) lines.push(`ORGANIZER:mailto:${event.organizerEmail}`);
  if (event.attendeeEmail) {
    const cn = event.attendeeName ? `;CN=${esc(event.attendeeName)}` : "";
    lines.push(`ATTENDEE${cn}:mailto:${event.attendeeEmail}`);
  }
  lines.push("END:VEVENT");
  return lines;
}

/**
 * A whole calendar. Used for the subscription feed (many events) and for a single
 * appointment download, which is the same document with one VEVENT in it.
 *
 * PRODID names this app because some clients show it, and X-WR-CALNAME is what Google
 * and Apple display as the calendar's name in the sidebar.
 */
export function buildIcsCalendar(calendarName: string, events: IcsEvent[]): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Assess360//Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(calendarName)}`,
    "X-WR-TIMEZONE:Asia/Kolkata",
    ...events.flatMap(vevent),
    "END:VCALENDAR",
  ];
  // Trailing CRLF: a file that does not end with one is rejected by some parsers.
  return `${lines.map(fold).join("\r\n")}\r\n`;
}

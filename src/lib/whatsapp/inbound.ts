import "server-only";
import { prisma } from "@/lib/db/prisma";
import { upsertContactFromLead } from "@/lib/contacts/upsert";

/**
 * What arrives off the phone after a coexistence number is connected.
 *
 * Three webhook fields, three different things:
 *   - smb_app_state_sync  the contacts in the owner's phone address book
 *   - history             up to six months of their own 1:1 conversations
 *   - smb_message_echoes  every message they send from the phone from now on
 *
 * 🔴 NONE OF THESE PEOPLE HAVE OPTED IN. A phone address book is not a marketing list,
 * and somebody who messaged a shop once has not agreed to receive templates. They are
 * stored with their own source values, and the broadcast audience excludes those
 * values unless the sender deliberately ticks them on. Getting this wrong would not
 * just be rude: unsolicited templates are exactly what drops a number's quality rating
 * and then its sending tier, so the cost of treating an address book as a list is the
 * WhatsApp number itself.
 *
 * 🟡 Everything here is best-effort and must never throw into the route. Meta retries
 * anything that is not a 2xx, and a bug that makes us return 500 on a chunk would have
 * Meta redeliver it forever while the sync window runs out.
 */

/* -------------------------------------------------------------------------- */
/* The payload, as Meta documents it                                           */
/* -------------------------------------------------------------------------- */

interface RawContactName {
  full_name?: string;
  first_name?: string;
  phone_number?: string;
}

interface RawStateSync {
  type?: string;
  contact?: RawContactName;
  action?: string;
  metadata?: { timestamp?: string };
}

/** A history message and an echoed message have the same shape. */
interface RawMessage {
  from?: string;
  /** Present on OUTGOING messages only, which is how direction is decided. */
  to?: string;
  id?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
}

interface RawHistoryThread {
  /** The other party's wa_id. The most reliable identity in the whole payload. */
  id?: string;
  messages?: RawMessage[];
}

interface RawHistoryError {
  code?: number;
  title?: string;
  message?: string;
}

interface RawHistory {
  metadata?: { phase?: string; chunk_order?: number; progress?: number };
  threads?: RawHistoryThread[];
  errors?: RawHistoryError[];
}

interface RawValue {
  metadata?: { phone_number_id?: string; display_phone_number?: string };
  state_sync?: RawStateSync[];
  history?: RawHistory[];
  message_echoes?: RawMessage[];
}

interface RawChange {
  field?: string;
  value?: RawValue;
}

export interface WhatsAppWebhookBody {
  entry?: Array<{ id?: string; changes?: RawChange[] }>;
}

/** What one delivery did, for the log line. Carries no names or numbers. */
export interface IngestOutcome {
  contacts: number;
  messages: number;
  skipped: string[];
}

/** Meta declined-to-share code, documented on the history webhook. */
const DECLINED_CODE = 2593109;

/* -------------------------------------------------------------------------- */
/* Whose number is this                                                        */
/* -------------------------------------------------------------------------- */

interface InboundScope {
  /** Null means the platform's own row; contactTenantOf turns that into Platform. */
  tenantId: string | null;
}

/**
 * Which workspace owns the number this delivery is about.
 *
 * 🔴 Ambiguity is refused, never guessed. If two workspaces have somehow stored the
 * same number, writing to either one is a coin flip that puts one business's
 * conversations in another's contact list. Dropping the delivery loses data; guessing
 * leaks it, and only one of those is recoverable.
 */
async function resolveScope(phoneNumberId: string | null, wabaId: string | null): Promise<InboundScope | null> {
  if (phoneNumberId) {
    const rows = await prisma.appSetting.findMany({
      where: { wabaPhoneNumberId: phoneNumberId },
      select: { tenantId: true },
      take: 2,
    });
    const only = rows.length === 1 ? rows[0] : null;
    if (only) return { tenantId: only.tenantId };
    if (rows.length > 1) return null;
  }
  if (wabaId) {
    const rows = await prisma.appSetting.findMany({
      where: { wabaBusinessAccountId: wabaId },
      select: { tenantId: true },
      take: 2,
    });
    const only = rows.length === 1 ? rows[0] : null;
    if (only) return { tenantId: only.tenantId };
  }
  return null;
}

/* -------------------------------------------------------------------------- */
/* Contacts                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Find or create the person behind a wa_id.
 *
 * Goes through the SAME upsert the lead-capture paths use, so there is still exactly
 * one answer to "is this the same person as last time". Passing no consent text is
 * what keeps these contacts out of the marketing audience: consent is stamped only
 * where it was actually given, and nobody gave it here.
 *
 * 🟡 That upsert also moves lastSeenAt to now, including while importing a chat from
 * five months ago. That is left alone rather than worked around: lastSeenAt means the
 * last time we heard anything about somebody, and an import is us hearing about them
 * now. The question an import actually answers - when did these two last talk - is
 * lastMessageAt, which is set from Meta's own timestamp below.
 */
async function contactFor(
  tenantId: string | null,
  waId: string | null | undefined,
  name: string | null | undefined,
  source: string,
): Promise<string | null> {
  const digits = (waId ?? "").replace(/\D/g, "");
  if (!digits) return null;
  const full = (name ?? "").trim();
  // Meta gives one name, not two. Splitting on the first space is a guess, so the
  // whole thing goes in firstName rather than inventing a surname for somebody.
  return upsertContactFromLead({ tenantId, mobile: digits, firstName: full || null }, { source });
}

/** The owner's address book. Each entry is a person, not a lead. */
async function ingestStateSync(scope: InboundScope, items: RawStateSync[]): Promise<number> {
  let n = 0;
  for (const item of items) {
    // "action" is Meta's add or remove. A removal from somebody's phone is NOT a
    // reason to delete a contact here, which may be a customer with a submission and
    // a consent record attached, so only additions are acted on.
    if (item.action && item.action.toLowerCase() !== "add") continue;
    const c = item.contact;
    if (!c?.phone_number) continue;
    const id = await contactFor(
      scope.tenantId,
      c.phone_number,
      c.full_name ?? c.first_name ?? null,
      "WHATSAPP_IMPORT",
    );
    if (id) n += 1;
  }
  return n;
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

interface Row {
  waMessageId: string;
  direction: string;
  type: string;
  body: string | null;
  sentAt: Date;
  origin: string;
}

/** Meta sends unix seconds as a string. Anything unreadable is dropped, not guessed. */
function readWhen(ts: string | undefined): Date | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  const d = new Date(n * 1000);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toRow(m: RawMessage, origin: string): Row | null {
  if (!m.id) return null;
  const sentAt = readWhen(m.timestamp);
  if (!sentAt) return null;
  return {
    waMessageId: m.id,
    // Meta documents `to` as present on outgoing messages only, which makes it the
    // one honest direction signal here: we never learn our own wa_id digits.
    direction: m.to ? "OUT" : "IN",
    type: m.type ?? "unknown",
    body: m.text?.body?.trim() ? m.text.body : null,
    sentAt,
    origin,
  };
}

/**
 * Write a contact's messages, idempotently.
 *
 * createMany with skipDuplicates against the (contact, message id) key, because
 * history arrives in overlapping chunks and Meta redelivers anything it did not see a
 * 200 for. Re-running a chunk has to be free, or a single slow response turns into
 * duplicated conversations.
 */
async function writeRows(contactId: string, rows: Row[]): Promise<number> {
  const first = rows[0];
  if (!first) return 0;
  const res = await prisma.whatsAppMessage.createMany({
    data: rows.map((r) => ({ ...r, contactId })),
    skipDuplicates: true,
  });

  // The newest message in this batch, which may still be older than one already
  // stored, so it only ever moves forward.
  const newest = rows.reduce<Date>((acc, r) => (r.sentAt > acc ? r.sentAt : acc), first.sentAt);
  await prisma.contact.updateMany({
    where: { id: contactId, OR: [{ lastMessageAt: null }, { lastMessageAt: { lt: newest } }] },
    data: { lastMessageAt: newest },
  });
  return res.count;
}

/* -------------------------------------------------------------------------- */
/* History                                                                     */
/* -------------------------------------------------------------------------- */

interface Progress {
  phase?: string;
  progress?: number;
  chunks?: number;
  threads?: number;
  messages?: number;
  declined?: { code: number; message: string };
  updatedAt?: string;
}

/**
 * Accumulate what the card shows.
 *
 * 🟡 Read-modify-write, so two chunks landing in the same instant can lose a count.
 * Accepted deliberately: this is a progress display, and the alternative is a row lock
 * on the settings row for every chunk of somebody's chat history. The messages
 * themselves are never counted this way - they are rows, and the rows are exact.
 */
async function bumpProgress(tenantId: string | null, patch: Progress): Promise<void> {
  const row = await prisma.appSetting.findFirst({
    where: tenantId ? { tenantId } : { tenantId: null },
    select: { id: true, wabaHistoryProgress: true },
  });
  if (!row) return;
  const prev = (row.wabaHistoryProgress ?? {}) as Progress;
  const next: Progress = {
    phase: patch.phase ?? prev.phase,
    progress: patch.progress ?? prev.progress,
    chunks: (prev.chunks ?? 0) + (patch.chunks ?? 0),
    threads: (prev.threads ?? 0) + (patch.threads ?? 0),
    messages: (prev.messages ?? 0) + (patch.messages ?? 0),
    declined: patch.declined ?? prev.declined,
    updatedAt: new Date().toISOString(),
  };
  await prisma.appSetting.update({
    where: { id: row.id },
    data: {
      wabaHistoryProgress: next as object,
      // A decline is the one thing the owner has to be told, because from their side
      // it looks exactly like a sync that is taking a long time.
      ...(patch.declined
        ? {
            wabaSyncError:
              "Your past chats were not shared. On the phone the sharing prompt was declined or missed, so only new messages will appear from now on.",
          }
        : {}),
    },
  });
}

async function ingestHistory(scope: InboundScope, items: RawHistory[]): Promise<{ contacts: number; messages: number }> {
  let contacts = 0;
  let messages = 0;

  for (const item of items) {
    const declined = (item.errors ?? []).find((e) => e.code === DECLINED_CODE);
    if (declined) {
      await bumpProgress(scope.tenantId, {
        declined: { code: DECLINED_CODE, message: declined.message ?? declined.title ?? "History not shared." },
      });
      continue;
    }

    const threads = item.threads ?? [];
    let chunkMessages = 0;

    for (const thread of threads) {
      const rows = (thread.messages ?? [])
        .map((m) => toRow(m, "HISTORY"))
        .filter((r): r is Row => r !== null);
      if (!rows.length) continue;

      // The thread id is the other party. Somebody who had a conversation with this
      // business is a stronger signal than an address-book entry, so they get their
      // own source - but still no consent.
      const contactId = await contactFor(scope.tenantId, thread.id, null, "WHATSAPP_CHAT");
      if (!contactId) continue;
      contacts += 1;
      chunkMessages += await writeRows(contactId, rows);
    }

    messages += chunkMessages;
    await bumpProgress(scope.tenantId, {
      phase: item.metadata?.phase,
      progress: item.metadata?.progress,
      chunks: 1,
      threads: threads.length,
      messages: chunkMessages,
    });
  }

  return { contacts, messages };
}

/* -------------------------------------------------------------------------- */
/* Echoes                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Messages the owner sends from their phone, mirrored to us.
 *
 * This is the half of coexistence that keeps working forever, and it is what makes the
 * rest trustworthy: without it, a sequence here would happily send a template to
 * somebody the owner replied to by hand ten minutes ago.
 */
async function ingestEchoes(scope: InboundScope, items: RawMessage[]): Promise<{ contacts: number; messages: number }> {
  let contacts = 0;
  let messages = 0;

  for (const m of items) {
    const row = toRow(m, "ECHO");
    if (!row) continue;
    // The other party is whoever is not the business: `to` on an outgoing message,
    // `from` on an incoming one.
    const waId = row.direction === "OUT" ? m.to : m.from;
    const contactId = await contactFor(scope.tenantId, waId, null, "WHATSAPP_CHAT");
    if (!contactId) continue;
    contacts += 1;
    messages += await writeRows(contactId, [row]);
  }

  return { contacts, messages };
}

/* -------------------------------------------------------------------------- */
/* The dispatcher                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Take one signed delivery and store what is in it.
 *
 * Returns what happened rather than throwing, so the route can log a line and answer
 * 200 whatever went wrong inside. A field we do not handle is named in `skipped` and
 * otherwise ignored, which keeps a new Meta field from looking like a failure.
 */
export async function ingestWhatsAppWebhook(body: WhatsAppWebhookBody): Promise<IngestOutcome> {
  const out: IngestOutcome = { contacts: 0, messages: 0, skipped: [] };

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const field = change.field ?? "unknown";
      const value = change.value;
      if (!value) continue;

      const scope = await resolveScope(value.metadata?.phone_number_id ?? null, entry.id ?? null);
      if (!scope) {
        // Either nobody here has this number, or more than one row claims it. Both are
        // "do not write", and both are worth seeing in the log by field name alone.
        out.skipped.push(field + ":unclaimed");
        continue;
      }

      try {
        if (field === "smb_app_state_sync" && value.state_sync?.length) {
          out.contacts += await ingestStateSync(scope, value.state_sync);
        } else if (field === "history" && value.history?.length) {
          const r = await ingestHistory(scope, value.history);
          out.contacts += r.contacts;
          out.messages += r.messages;
        } else if (field === "smb_message_echoes" && value.message_echoes?.length) {
          const r = await ingestEchoes(scope, value.message_echoes);
          out.contacts += r.contacts;
          out.messages += r.messages;
        } else {
          out.skipped.push(field);
        }
      } catch (e) {
        // Logged by FIELD NAME and error message only. Never the payload: it is
        // somebody's conversation, and a log is the easiest place to leak one.
        console.error("[whatsapp-hook] ingest failed for", field, e instanceof Error ? e.message : String(e));
        out.skipped.push(field + ":failed");
      }
    }
  }

  return out;
}

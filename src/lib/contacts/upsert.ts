import "server-only";
import { prisma } from "@/lib/db/prisma";
import { generateId } from "@/lib/ids";
import { toE164Digits } from "@/features/nurture/config";
import { fireWorkflowTrigger } from "@/lib/workflows/enqueue";
import { contactTenantOf } from "@/lib/contacts/tenant";

/**
 * Turning a captured lead into a CONTACT.
 *
 * One function, called from both lead-capture paths, so there is exactly one answer to
 * "is this the same person as last time". Everything downstream - tags, the contacts
 * screen, an audience to broadcast to, an unsubscribe that actually stops messages -
 * rests on that answer being made in one place.
 *
 * 🟡 Called OUTSIDE the transaction that writes the lead, and never allowed to throw
 * into it. A contact is a convenience built on top of a submission; a submission is the
 * lead itself. If this fails, the lead is already safely stored with its own columns
 * and the contact can be rebuilt later by the backfill script. The reverse trade would
 * mean a tagging bug could cost somebody a customer.
 */

/** Identity rules, in one place so the backfill script and the live path cannot drift. */
export interface LeadIdentity {
  /** The funnel owner. Null means a platform-owned funnel; see contactTenantOf. */
  tenantId: string | null;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
  mobile?: string | null;
  profession?: string | null;
}

/** Re-exported from its own leaf module; see contacts/tenant.ts for why it moved. */
export { contactTenantOf };

/**
 * The fields whose change means "this contact was updated".
 *
 * Deliberately short, and deliberately not "every column". lastSeenAt and lastMessageAt
 * are housekeeping - one moves on every submission, the other every time a WhatsApp
 * message passes - and consent has its own trigger. A person would recognise every
 * field in this list as theirs.
 */
const WATCHED_FIELDS = ["firstName", "lastName", "profession", "email", "mobile"] as const;

const clean = (v: string | null | undefined): string | null => {
  const t = (v ?? "").trim();
  return t ? t : null;
};

/** Lower-cased, because somebody typing Name@Example.com twice is one person. */
const cleanEmail = (v: string | null | undefined): string | null => {
  const t = clean(v)?.toLowerCase() ?? null;
  return t && t.includes("@") ? t : null;
};

/**
 * The tenant's dialling code, for turning a bare local mobile into something WhatsApp
 * will accept. One column, read on its own rather than through resolveWabaConfig,
 * which also decrypts an access token this has no use for.
 */
export async function defaultCountryCodeFor(tenantId: string): Promise<string> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: { tenantId },
      select: { wabaDefaultCountryCode: true },
    });
    return s?.wabaDefaultCountryCode?.trim() || "91";
  } catch {
    return "91";
  }
}

/**
 * Find or create the person behind a lead, and return their id.
 *
 * Matching is by MOBILE first and email second, because a mobile is what WhatsApp
 * needs and is the identity this product will message on. Returns null when there is
 * neither, which is a legitimate outcome: a funnel that collects only a first name has
 * captured something, but not somebody you can reach.
 *
 * 🟡 Partial-identity collisions are left alone on purpose. If the email belongs to one
 * contact and the mobile to another, this updates the mobile match and does not move
 * the email, because silently merging two people is far worse than carrying a duplicate
 * that somebody can merge by hand once merging exists.
 */
export async function upsertContactFromLead(
  lead: LeadIdentity,
  opts: { source: string; consentText?: string | null } = { source: "SUBMISSION" },
): Promise<string | null> {
  const email = cleanEmail(lead.email);
  const tenantId = contactTenantOf(lead.tenantId);
  const cc = await defaultCountryCodeFor(tenantId);
  const mobile = toE164Digits(clean(lead.mobile), cc);
  if (!mobile && !email) return null;

  // The profile fields come back as well as the identity ones, because CONTACT_UPDATED
  // can only be answered by comparing before with after. See WATCHED_FIELDS below.
  const pick = {
    id: true,
    email: true,
    mobile: true,
    consentAt: true,
    firstName: true,
    lastName: true,
    profession: true,
  } as const;

  const existing = mobile
    ? await prisma.contact.findUnique({
        where: { tenantId_mobile: { tenantId: tenantId, mobile } },
        select: pick,
      })
    : null;

  const byEmail =
    !existing && email
      ? await prisma.contact.findUnique({
          where: { tenantId_email: { tenantId: tenantId, email } },
          select: pick,
        })
      : null;

  const found = existing ?? byEmail;
  const now = new Date();

  // Blank fields are filled in, known ones are left alone. Somebody who gave a last
  // name in March and skipped it in June still has a last name.
  const fill = {
    firstName: clean(lead.firstName) ?? undefined,
    lastName: clean(lead.lastName) ?? undefined,
    profession: clean(lead.profession) ?? undefined,
  };

  if (found) {
    // Consent is stamped ONCE, the first time. Re-stamping it on every later visit
    // would quietly replace the wording they originally saw with today's wording,
    // which is the one thing the stored text exists to prevent.
    const consent =
      !found.consentAt && opts.consentText
        ? { consentAt: now, consentText: opts.consentText }
        : {};
    // Only widen the identity: give the email contact its mobile, or vice versa, and
    // only when that value is not already somebody else's.
    const widen: { mobile?: string; email?: string } = {};
    if (byEmail && mobile && !byEmail.mobile) {
      const taken = await prisma.contact.findUnique({
        where: { tenantId_mobile: { tenantId: tenantId, mobile } },
        select: { id: true },
      });
      if (!taken) widen.mobile = mobile;
    }
    if (existing && email && !existing.email) {
      const taken = await prisma.contact.findUnique({
        where: { tenantId_email: { tenantId: tenantId, email } },
        select: { id: true },
      });
      if (!taken) widen.email = email;
    }
    const data = { ...fill, ...widen, ...consent, lastSeenAt: now };
    await prisma.contact.update({ where: { id: found.id }, data });

    // 🔴 WHAT COUNTS AS AN UPDATE IS DECIDED HERE, FIELD BY FIELD, and the reason is
    // volume. This function runs on EVERY submission and always moves lastSeenAt, so a
    // trigger that fired whenever the row was written would fire on nearly every form
    // fill - and with re-entry on, replay a seven-day sequence to somebody who did
    // nothing but revisit. Only a field the person would call theirs counts, and only
    // when its value actually changes.
    const changed = WATCHED_FIELDS.filter((k) => {
      const next = (data as Record<string, unknown>)[k];
      return next !== undefined && next !== (found as Record<string, unknown>)[k];
    });
    if (changed.length) {
      await fireWorkflowTrigger("CONTACT_UPDATED", { tenantId, contactId: found.id });
    }
    return found.id;
  }

  const created = await prisma.contact.create({
    data: {
      tenantId,
      mobile,
      email,
      firstName: clean(lead.firstName),
      lastName: clean(lead.lastName),
      profession: clean(lead.profession),
      source: opts.source,
      lastSeenAt: now,
      optOutToken: generateId(24),
      ...(opts.consentText ? { consentAt: now, consentText: opts.consentText } : {}),
    },
    select: { id: true },
  });
  await fireWorkflowTrigger("CONTACT_CREATED", { tenantId, contactId: created.id });
  return created.id;
}

/**
 * The whole thing, swallowed.
 *
 * The lead-capture paths call THIS, never the function above, so that a contact
 * problem can only ever be a log line. Returns the id when it worked, null when it did
 * not, and the caller writes the link only if there is one.
 */
export async function linkContactSafely(
  lead: LeadIdentity,
  opts: { source: string; consentText?: string | null },
): Promise<string | null> {
  try {
    return await upsertContactFromLead(lead, opts);
  } catch (e) {
    console.error("[contacts] upsert failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

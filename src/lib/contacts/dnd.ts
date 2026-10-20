import "server-only";
import { prisma } from "@/lib/db/prisma";
import { contactTenantOf, defaultCountryCodeFor } from "@/lib/contacts/upsert";
import { toE164Digits } from "@/features/nurture/config";

/**
 * DO NOT DISTURB, and the one place that is allowed to answer it.
 *
 * 🔴 Every marketing send goes through isSuppressed first - the one-shot nurture, a
 * workflow step, a broadcast. One function rather than a check per sender, because the
 * failure mode of the alternative is specific and ugly: somebody unsubscribes, three
 * of the four senders honour it, and the fourth keeps messaging them until Meta
 * downgrades the number over the blocks that follow.
 *
 * Suppression is per PERSON, not per address. Unsubscribing stops email and WhatsApp
 * together, because somebody who says stop has not said "stop, but the other channel
 * is fine", and a product that reads it that way deserves the block it gets.
 */

export interface MessageTarget {
  email?: string | null;
  mobile?: string | null;
}

/**
 * Is this person off limits?
 *
 * 🟡 Fails OPEN on an error, deliberately, and that is the one place here worth
 * arguing about. Failing closed would mean a database blip silently stops every
 * transactional result email in the product. The row is read by primary key on an
 * indexed column; if that is failing, the send is about to fail anyway.
 */
export async function isSuppressed(
  tenantId: string | null,
  target: MessageTarget,
): Promise<boolean> {
  const owner = contactTenantOf(tenantId);
  const email = (target.email ?? "").trim().toLowerCase() || null;
  const rawMobile = (target.mobile ?? "").trim() || null;
  if (!email && !rawMobile) return false;

  try {
    const cc = await defaultCountryCodeFor(owner);
    const mobile = toE164Digits(rawMobile, cc);
    const hit = await prisma.contact.findFirst({
      where: {
        tenantId: owner,
        marketingOptOutAt: { not: null },
        OR: [...(mobile ? [{ mobile }] : []), ...(email ? [{ email }] : [])],
      },
      select: { id: true },
    });
    return !!hit;
  } catch (e) {
    console.error("[contacts] suppression check failed:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Stop messaging this person.
 *
 * Returns the contact's display name when it worked, so the page can say who was
 * unsubscribed, and null when the token matches nothing. Idempotent: unsubscribing
 * twice keeps the FIRST timestamp, because when they left is a fact and the second
 * click is just a reload.
 */
export async function suppressByToken(
  token: string,
  source: "LINK" | "WHATSAPP_STOP" | "ADMIN" = "LINK",
): Promise<{ ok: true; label: string } | null> {
  const clean = token.trim();
  if (!clean) return null;
  const c = await prisma.contact.findUnique({
    where: { optOutToken: clean },
    select: { id: true, firstName: true, email: true, mobile: true, marketingOptOutAt: true },
  });
  if (!c) return null;
  if (!c.marketingOptOutAt) {
    await prisma.contact.update({
      where: { id: c.id },
      data: { marketingOptOutAt: new Date(), optOutSource: source },
    });
  }
  // Masked: the page is reachable by anybody holding the link, so it confirms enough
  // to be reassuring and not enough to be a lookup tool.
  const label = c.email ? maskEmail(c.email) : c.mobile ? maskMobile(c.mobile) : (c.firstName ?? "this contact");
  return { ok: true, label };
}

/** Put somebody back on the list. Admin-side only; the public page cannot do this. */
export async function unsuppressContact(contactId: string): Promise<void> {
  await prisma.contact.update({
    where: { id: contactId },
    data: { marketingOptOutAt: null, optOutSource: null },
  });
}

function maskEmail(e: string): string {
  const [user = "", domain = ""] = e.split("@");
  const head = user.slice(0, 2);
  return `${head}${"*".repeat(Math.max(1, user.length - 2))}@${domain}`;
}

function maskMobile(m: string): string {
  return `${"*".repeat(Math.max(0, m.length - 4))}${m.slice(-4)}`;
}

/**
 * The unsubscribe link for a contact, on the tenant's own domain when they have one.
 *
 * The brand matters here more than anywhere else in the product: a stop link that
 * points at a host the person has never heard of looks like the phishing it is trying
 * not to be, and gets reported instead of clicked.
 */
export async function unsubscribeUrlFor(
  tenantId: string | null,
  token: string | null | undefined,
): Promise<string | null> {
  if (!token) return null;
  const { tenantCanonicalOrigin } = await import("@/lib/seo/site");
  const { env } = await import("@/lib/env");
  const origin = (await tenantCanonicalOrigin(tenantId)) ?? env.NEXT_PUBLIC_APP_URL;
  return `${origin.replace(/\/+$/, "")}/u/${token}`;
}

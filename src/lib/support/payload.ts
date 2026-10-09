import { type SupportKind } from "@prisma/client";
import { supportRef } from "@/lib/support/model";

/**
 * The webhook payload, built in a PLAIN module.
 *
 * Separate from lib/support/notify, which is server-only (it reaches for prisma, env
 * and the mail sender). The payload is the contract with the owner's CRM, and a
 * contract that can only be exercised by running the app is a contract nobody checks:
 * here it is a pure function, and verify:support pins its keys.
 */

export interface SupportRequestFacts {
  id: string;
  number: number;
  kind: SupportKind;
  topic: string;
  subject: string;
  contactEmail: string;
  contactWhatsapp: string | null;
  /** The person who raised it, when the login still exists. */
  contactName: string | null;
  tenantId: string;
  tenantName: string;
}

/**
 * FLAT, with contact_name / contact_email / contact_phone and an event_type, because
 * those are the keys the owner's CRM automations already map. A nested shape would read
 * better here and cost a mapping exercise there, and handing WhatsApp to the CRM was
 * about not doing the same work twice.
 *
 * It carries the phone number and decides nothing about it. Whether this person can be
 * messaged, on which template, in which language, is the CRM's business and no longer
 * this app's.
 */
export function replyPayload(
  req: SupportRequestFacts,
  body: string,
  url: string,
  test: boolean,
): Record<string, unknown> {
  return {
    event_type: "support_reply",
    reference: supportRef(req.kind, req.number),
    kind: req.kind,
    request_id: req.id,
    topic: req.topic,
    subject: req.subject,
    thread_url: url,
    tenant_id: req.tenantId,
    tenant_name: req.tenantName,
    contact_name: req.contactName ?? req.tenantName,
    contact_email: req.contactEmail,
    // Null until that login saves a number. Left as null rather than omitted, so a CRM
    // mapping never has to tell "no number" apart from "key missing in this version".
    contact_phone: req.contactWhatsapp,
    reply_body: body,
    reply_at: new Date().toISOString(),
    // So a CRM can drop a test on the floor rather than WhatsApp a real customer while
    // somebody is checking their endpoint.
    test,
  };
}

/** Every key the CRM is promised. Exported so the verifier cannot drift from the
 *  builder, and so a removal has to be a deliberate edit in two places. */
export const REPLY_PAYLOAD_KEYS = [
  "event_type",
  "reference",
  "kind",
  "request_id",
  "topic",
  "subject",
  "thread_url",
  "tenant_id",
  "tenant_name",
  "contact_name",
  "contact_email",
  "contact_phone",
  "reply_body",
  "reply_at",
  "test",
] as const;

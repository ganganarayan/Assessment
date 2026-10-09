/**
 * Support feature verification (no DB).
 *
 * Exercises the pure parts: the reference format, the mode vocabulary, the topic
 * validation, the status helpers, the upload limits that keep a submit inside the
 * request body limit, and the CRM webhook payload.
 *
 * The limit check is the one that earns its place. Three attachments at the per-file
 * maximum must still fit inside the 8mb server-action body, and nothing in the app
 * fails loudly when they do not: the submit dies at the transport and the customer sees
 * a dead button. A number raised later by somebody being generous is exactly how that
 * comes back, so it is pinned here.
 *
 *   npx tsx scripts/verify-support.ts
 */
import {
  ALLOWED_ATTACHMENT_TYPES,
  isClosedStatus,
  isSupportMode,
  KIND_LABEL,
  KIND_NOUN,
  MAX_ATTACHMENTS,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENT_TOTAL_BYTES,
  PENDING_STATUSES,
  STATUS_LABEL,
  SUPPORT_KINDS,
  SUPPORT_MODES,
  SUPPORT_TOPICS,
  supportRef,
  TENANT_STATUS_LABEL,
} from "../src/lib/support/model";
import { raiseSchema, messageSchema, whatsappSchema } from "../src/features/support/schema";
import { replyPayload, REPLY_PAYLOAD_KEYS, type SupportRequestFacts } from "../src/lib/support/payload";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

console.log("Support and onboarding verification\n");

// --- The reference ---
expect("ticket reference reads AS-1042", supportRef("SUPPORT", 1042) === "AS-1042", supportRef("SUPPORT", 1042));
expect("onboarding reference reads OB-1042", supportRef("ONBOARDING", 1042) === "OB-1042", supportRef("ONBOARDING", 1042));
expect(
  "the two kinds never share a reference for one number",
  supportRef("SUPPORT", 7) !== supportRef("ONBOARDING", 7),
  "one sequence feeds both, so the prefix is the only thing telling them apart",
);

// --- Modes ---
for (const m of SUPPORT_MODES) expect(`mode recognised: ${m}`, isSupportMode(m));
expect("an unknown mode is rejected", !isSupportMode("SOMETHING_ELSE"));
expect("the mode list is exactly the three", SUPPORT_MODES.length === 3, SUPPORT_MODES.join(","));

// --- Labels cover every status, on both sides ---
const STATUSES = ["OPEN", "AWAITING_US", "AWAITING_TENANT", "RESOLVED", "CLOSED", "FORWARDED"] as const;
for (const s of STATUSES) {
  expect(`owner label for ${s}`, typeof STATUS_LABEL[s] === "string" && STATUS_LABEL[s].length > 0);
  expect(`tenant label for ${s}`, typeof TENANT_STATUS_LABEL[s] === "string" && TENANT_STATUS_LABEL[s].length > 0);
}
expect("FORWARDED tells the tenant the answer went to email", /email/i.test(TENANT_STATUS_LABEL.FORWARDED), TENANT_STATUS_LABEL.FORWARDED);

// --- Open versus finished ---
expect("open statuses are not closed", !isClosedStatus("OPEN") && !isClosedStatus("AWAITING_US") && !isClosedStatus("AWAITING_TENANT"));
expect("resolved, closed and forwarded are finished", isClosedStatus("RESOLVED") && isClosedStatus("CLOSED") && isClosedStatus("FORWARDED"));
expect(
  "the badge counts only what is owed by us",
  PENDING_STATUSES.length === 2 && PENDING_STATUSES.includes("OPEN") && PENDING_STATUSES.includes("AWAITING_US"),
  PENDING_STATUSES.join(","),
);
expect(
  "AWAITING_TENANT does not badge",
  !PENDING_STATUSES.includes("AWAITING_TENANT"),
  "a thread waiting on the customer is not work waiting on us",
);

// --- Kinds and topics ---
for (const k of SUPPORT_KINDS) {
  expect(`${k} has a label and a noun`, !!KIND_LABEL[k] && !!KIND_NOUN[k]);
  expect(`${k} has topics`, SUPPORT_TOPICS[k].length >= 5, String(SUPPORT_TOPICS[k].length));
  expect(`${k} offers a catch-all`, SUPPORT_TOPICS[k].some((t) => /something else/i.test(t)));
  const unique = new Set(SUPPORT_TOPICS[k]).size === SUPPORT_TOPICS[k].length;
  expect(`${k} topics are unique`, unique);
}

// --- The raise form's rules ---
const good = {
  kind: "SUPPORT" as const,
  topic: SUPPORT_TOPICS.SUPPORT[0]!,
  subject: "Submissions stopped arriving yesterday",
  body: "Two leads completed the funnel this morning and neither appeared under Submissions.",
};
expect("a complete request validates", raiseSchema.safeParse(good).success);
expect(
  "a topic that is not on the list is refused",
  !raiseSchema.safeParse({ ...good, topic: "Anything I like" }).success,
  "the topic is what the queue is scanned by, so free text there defeats the point",
);
expect(
  "an onboarding topic is refused on a ticket",
  !raiseSchema.safeParse({ ...good, topic: SUPPORT_TOPICS.ONBOARDING[0]! }).success,
  "the lists are per kind, and crossing them would file the request in the wrong queue",
);
expect("a one-word description is refused", !raiseSchema.safeParse({ ...good, body: "broken" }).success);
expect("an empty subject is refused", !raiseSchema.safeParse({ ...good, subject: "" }).success);
expect("whitespace is trimmed, not counted", !raiseSchema.safeParse({ ...good, subject: "    " }).success);

expect("a reply needs a body", !messageSchema.safeParse({ requestId: "abc", body: "   " }).success);
expect("a reply with a body passes", messageSchema.safeParse({ requestId: "abc", body: "Fixed, try again." }).success);

// --- The WhatsApp number ---
expect("a blank number is allowed (email only)", whatsappSchema.safeParse({ whatsapp: "" }).success);
expect("a readable number is allowed", whatsappSchema.safeParse({ whatsapp: "+91 93568 19176" }).success);
expect("letters are refused", !whatsappSchema.safeParse({ whatsapp: "call me maybe" }).success);

// --- Upload limits versus the request body limit ---
const BODY_LIMIT = 8 * 1024 * 1024;
expect(
  "the attachment total fits inside the 8mb action body",
  MAX_ATTACHMENT_TOTAL_BYTES < BODY_LIMIT,
  `${MAX_ATTACHMENT_TOTAL_BYTES} vs ${BODY_LIMIT}`,
);
expect(
  "the total leaves room for the text fields and framework overhead",
  BODY_LIMIT - MAX_ATTACHMENT_TOTAL_BYTES >= 1024 * 1024,
  "a total that only just fits fails on the request that carries a long description",
);
expect(
  "one file alone cannot exceed the total",
  MAX_ATTACHMENT_BYTES <= MAX_ATTACHMENT_TOTAL_BYTES,
  `${MAX_ATTACHMENT_BYTES} vs ${MAX_ATTACHMENT_TOTAL_BYTES}`,
);
expect("three attachments are offered", MAX_ATTACHMENTS === 3, String(MAX_ATTACHMENTS));
expect(
  "only image and PDF types are accepted",
  ALLOWED_ATTACHMENT_TYPES.every((t) => t.startsWith("image/") || t === "application/pdf"),
  ALLOWED_ATTACHMENT_TYPES.join(","),
);

// --- The CRM webhook payload ---
//
// This is the contract with somebody else's system. A renamed key here is a WhatsApp
// that silently stops going out at their end, with nothing failing at ours, so the keys
// are pinned rather than assumed.
const facts: SupportRequestFacts = {
  id: "clz123",
  number: 1042,
  kind: "SUPPORT",
  topic: SUPPORT_TOPICS.SUPPORT[0]!,
  subject: "Submissions stopped arriving",
  contactEmail: "deepak@acme.com",
  contactWhatsapp: "+919999999999",
  contactName: "Deepak",
  tenantId: "ten_1",
  tenantName: "Acme Clinic",
};
const payload = replyPayload(facts, "Fixed, try again.", "https://app/w/support/clz123", false);

expect(
  "the payload carries exactly the promised keys",
  REPLY_PAYLOAD_KEYS.every((k) => k in payload) && Object.keys(payload).length === REPLY_PAYLOAD_KEYS.length,
  `${Object.keys(payload).sort().join(",")} vs ${[...REPLY_PAYLOAD_KEYS].sort().join(",")}`,
);
expect("event_type is support_reply", payload.event_type === "support_reply", String(payload.event_type));
expect("the reference is the one the customer was emailed", payload.reference === "AS-1042", String(payload.reference));
expect(
  "the CRM gets the keys it already maps",
  payload.contact_name === "Deepak" && payload.contact_email === "deepak@acme.com" && payload.contact_phone === "+919999999999",
  "contact_name / contact_email / contact_phone",
);
expect("the reply body is sent whole", payload.reply_body === "Fixed, try again.", String(payload.reply_body));
expect("the thread link is sent", payload.thread_url === "https://app/w/support/clz123");
expect("a real reply is not marked as a test", payload.test === false);
expect("a test is marked", replyPayload(facts, "x", "u", true).test === true);
expect(
  "reply_at is an ISO timestamp",
  typeof payload.reply_at === "string" && !Number.isNaN(Date.parse(payload.reply_at)),
  String(payload.reply_at),
);

// 🔴 contact_phone must be PRESENT and null, never missing. A CRM mapping cannot tell
// "this person saved no number" apart from "this version of the payload dropped the
// key", and the two need different handling at their end.
const noPhone = replyPayload({ ...facts, contactWhatsapp: null }, "x", "u", false);
expect("contact_phone is present even when there is no number", "contact_phone" in noPhone);
expect("contact_phone is null, not an empty string", noPhone.contact_phone === null, String(noPhone.contact_phone));

// The workspace name stands in when the login that raised it has been removed.
const noName = replyPayload({ ...facts, contactName: null }, "x", "u", false);
expect("contact_name falls back to the workspace", noName.contact_name === "Acme Clinic", String(noName.contact_name));

expect(
  "an onboarding reply is distinguishable by reference and kind",
  (() => {
    const ob = replyPayload({ ...facts, kind: "ONBOARDING" }, "x", "u", false);
    return ob.reference === "OB-1042" && ob.kind === "ONBOARDING";
  })(),
);


console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);

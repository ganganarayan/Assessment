/**
 * Booking-CTA click verification (no DB).
 *
 * The failure mode this guards is silent: the thank-you page lives in the CRM, so if
 * the event name drifts, the trigger disappears from the webhook dropdown, or the
 * payload stops carrying the contact, nothing errors — the owner simply never learns
 * that someone asked for a call, and there is no second channel to notice it on.
 *
 *   npx tsx scripts/verify-cta-click.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { EventType } from "@prisma/client";
import { buildEnvelope, shapePayload } from "../src/lib/events/payload";
import { ctaResultUrl } from "../src/lib/cta/result-url";
import {
  ACTIVE_EVENT_TYPES,
  EMITTED_EVENT_NAMES,
  EVENT_LABEL,
  EVENT_NAME,
  NAME_TO_TYPE,
  WEBHOOK_NAME_REGEX,
} from "../src/features/events/types";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));
const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

console.log("Booking CTA click verification\n");

/* ---- Event-name tripwire: a rename silently stops the CRM automation ---- */
expect(
  'the event name is exactly "booking_requested"',
  EVENT_NAME[EventType.CTA_CLICKED] === "booking_requested",
  `got "${EVENT_NAME[EventType.CTA_CLICKED]}" — renaming it orphans the user's saved webhook`,
);
expect("the name round-trips back to CTA_CLICKED", NAME_TO_TYPE["booking_requested"] === EventType.CTA_CLICKED);
expect("the name is a legal webhook name", WEBHOOK_NAME_REGEX.test("booking_requested"));

/* ---- It must be selectable as a webhook trigger, or it can never be wired ---- */
expect("CTA_CLICKED is an active event type", ACTIVE_EVENT_TYPES.includes(EventType.CTA_CLICKED));
expect("booking_requested is an emitted (selectable) name", EMITTED_EVENT_NAMES.includes("booking_requested"));
expect("the trigger has a human label", !!EVENT_LABEL[EventType.CTA_CLICKED]);

/* ---- The payload must carry who to contact, and where to read their result ---- */
const BASE = "https://assess.example.com";
const envelope = buildEnvelope(
  EventType.CTA_CLICKED,
  {
    submissionId: "sub_123",
    customerId: "cust_abc",
    resultToken: "tok_456",
    tenant: { id: "t1", slug: "acme", name: "Acme" },
    assessment: { id: "a1", slug: "clarity", title: "Clarity Assessment" },
    lead: { firstName: "Asha", lastName: "Rao", email: "asha@example.com", mobile: "+919000000000" },
    // The route passes this explicitly (the shared builder only derives a result URL
    // when a score rides along, and a booking click carries none) — asserted below.
    resultUrl: ctaResultUrl(BASE, "clarity", "sub_123", "tok_456"),
    cta: { blockId: "blk_1", label: "Apply for your seat", destinationUrl: "https://app.vidapulse.io/api/analytics/cta/link/u1?cid=cust_abc" },
  },
  BASE,
);

expect("event name on the envelope", envelope.event === "booking_requested");
expect("contact_name is present", envelope.contact_name === "Asha Rao");
expect("contact_email is present", envelope.contact_email === "asha@example.com", "the CRM needs it to send the confirmation");
expect("contact_phone is present", envelope.contact_phone === "+919000000000", "the CRM needs it to send the WhatsApp message");
expect("the submission is identified", envelope.submission?.id === "sub_123");

const meta = envelope.metadata as Record<string, unknown>;
const cta = meta.cta as Record<string, unknown> | null;
expect("metadata carries the clicked block id", cta?.blockId === "blk_1");
expect("metadata carries the button label", cta?.label === "Apply for your seat");
expect("metadata carries the destination", typeof cta?.destinationUrl === "string");
expect(
  "metadata carries the result URL for manual review",
  typeof meta.resultUrl === "string" && (meta.resultUrl as string).includes("sub_123"),
  `got ${String(meta.resultUrl)}`,
);

/* ---- The shared result-URL helper ---- */
expect(
  "the result URL carries the token, so it opens without a sign-in",
  ctaResultUrl(BASE, "clarity", "sub_1", "tok_9") === `${BASE}/a/clarity/r/sub_1?t=tok_9`,
  ctaResultUrl(BASE, "clarity", "sub_1", "tok_9"),
);
expect(
  "a tokenless submission still yields a usable URL",
  ctaResultUrl(BASE, "clarity", "sub_1", null) === `${BASE}/a/clarity/r/sub_1`,
);
expect(
  "a trailing slash on the base URL does not double up",
  ctaResultUrl(`${BASE}/`, "clarity", "sub_1", null) === `${BASE}/a/clarity/r/sub_1`,
);

/* ---- The shaped payload (what is actually POSTed) keeps all of it ---- */
const shaped = shapePayload(EventType.CTA_CLICKED, envelope);
for (const k of ["event", "contact_name", "contact_email", "contact_phone", "metadata"]) {
  expect(`shaped payload keeps ${k}`, shaped[k] !== undefined);
}

/* ---- Route invariants: no open redirect, and the click is recorded first ---- */
const route = read("src/app/api/cta/[submissionId]/[blockId]/route.ts");
const notifySrc = read("src/lib/cta/notify.ts");
expect(
  "the destination comes from the PUBLISHED page, never the request",
  route.includes("resultPagePublished") && !/searchParams\.get\(\s*["']to["']/.test(route),
  "taking a destination from the query string would be an open redirect",
);
expect("the click row is written", route.includes("prisma.ctaClick.create"));
expect("the first-click stamp is set once", /ctaClickedAt: null/.test(route), "a later click must not reset the date");
expect("the webhook goes through emitEvent (durable + retried)", route.includes("emitEvent(EventType.CTA_CLICKED"));
expect("the destination keeps its VidaPulse ids", route.includes("stampVidapulseCtaUrl"));
expect(
  "the route passes the result URL into the payload",
  route.includes("resultUrl: ctaResultUrl("),
  "the builder cannot derive one for this event, so the CRM would get no link back to the result",
);
expect(
  "the email and the webhook use the SAME result-URL helper",
  notifySrc.includes("ctaResultUrl(") && route.includes("ctaResultUrl("),
  "two hand-built URLs would drift and point at different pages for one click",
);

/* ---- Notification durability ---- */
expect(
  "a missing address is settled, not left pending",
  route.includes('notifyStatus: notifyEmail ? "pending" : "skipped"'),
  "a permanently-unsendable row would be retried by the cron forever",
);
expect("a failed send backs off and is retried", notifySrc.includes("notifyNextAttemptAt") && notifySrc.includes("BACKOFF_MS"));
expect("it gives up as dead rather than silently", notifySrc.includes('"dead"'));
expect("the row is lease-claimed against double sends", notifySrc.includes("updateMany") && notifySrc.includes('notifyStatus: "pending"'));
expect("the cron retries due notifications", read("scripts/sweep-abandoned.ts").includes("sweepCtaNotifications"));

/* ---- Opt-in: an ordinary button must be untouched ---- */
const vsl = read("src/features/assessment/components/public/vsl-result-page.tsx");
expect(
  "only a bookingCta button is rerouted",
  /config\.bookingCta && submissionId/.test(vsl),
  "every other button must keep linking straight out exactly as before",
);
expect(
  "an admin preview never records a click",
  read("src/app/a/[slug]/r/[submissionId]/page.tsx").includes("canViewInternally ? null : submissionId"),
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);

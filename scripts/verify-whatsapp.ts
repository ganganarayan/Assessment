/**
 * The WhatsApp coexistence connection, and the four ways it goes wrong silently.
 *
 * Every invariant here protects something that cannot be undone by a later deploy.
 *
 *   1. 🔴 NO /register, EVER. A normal Cloud API onboarding ends with
 *      POST /{phone-number-id}/register. Coexistence must not: registering moves the
 *      number onto the Cloud API alone and takes it OFF the WhatsApp Business app on
 *      the owner's phone, which is the one thing the whole feature exists to avoid.
 *      There is no flag and no undo. The call is absent rather than guarded, and
 *      absence is what gets re-added by somebody following Meta's main tutorial.
 *
 *   2. 🔴 A GOOD CODE IS NOT THROWN AWAY. The Embedded Signup code lives about thirty
 *      seconds. Meta does not always post the WABA id back to the opening window - a
 *      plain Login for Business configuration never does - and refusing the code on the
 *      strength of a missing browser message discards a connection Meta already
 *      granted, after which the owner has to redo the popup. The schema therefore
 *      accepts a payload with no wabaId, and the server asks the token instead.
 *
 *   3. 🔴 ONE REQUEST EACH, SPENT ONCE. Contacts and history can each be asked for once,
 *      inside roughly 24 hours. Meta refuses a second request and the only way back is
 *      for the business to offboard and redo everything. So a malformed sync kind must
 *      never fall through to a default, and the action must refuse before it calls Meta
 *      rather than after.
 *
 *   4. 🟡 A MISSING NUMBER IS NOT A ZERO. These dashboard fields come and go between
 *      Graph versions. A field Meta did not serve has to arrive as null so the screen
 *      can say "Not reported"; mapped to 0 or "" it becomes a confident wrong number on
 *      the screen an owner uses to decide whether their sending is healthy. A sum over
 *      no rows is still 0, and that difference is deliberate - both halves are pinned.
 *
 *   5. The people who arrive off a connected phone carry the sources the broadcast
 *      guard excludes. verify:contact-consent proves the guard names those two strings;
 *      this proves the webhook writes them. Either half alone is worthless.
 *
 * No network: global fetch is replaced, so the Graph readers are driven against canned
 * Meta payloads and this runs in the Railway build.
 *
 *   npx tsx --conditions=react-server scripts/verify-whatsapp.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { embeddedSignupSchema, syncKindSchema } from "../src/features/whatsapp/types";
import { UNCONSENTED_SOURCES } from "../src/lib/contacts/sources";
import {
  readConversationTotals,
  readHealthStatus,
  readPhoneHealth,
  readSendingLimits,
  readTemplateAnalytics,
} from "../src/lib/whatsapp/insights";
import { SNAPSHOT_WINDOW_DAYS, buildWabaSnapshot, snapshotIsStale } from "../src/lib/whatsapp/snapshot";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const read = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

console.log("WhatsApp coexistence verification\n");

/* -------------------------------------------------------------------------- */
/* 1. The step that must not exist                                             */
/* -------------------------------------------------------------------------- */

const graphSrc = read("src", "lib", "whatsapp", "graph.ts");
const actionsSrc = read("src", "features", "whatsapp", "actions.ts");
const insightsSrc = read("src", "lib", "whatsapp", "insights.ts");
const inboundSrc = read("src", "lib", "whatsapp", "inbound.ts");

// Comments stripped: graph.ts explains at length WHY register is absent, and the
// explanation must not read as the call being present.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

for (const [name, src] of [
  ["graph.ts", graphSrc],
  ["actions.ts", actionsSrc],
  ["insights.ts", insightsSrc],
  ["inbound.ts", inboundSrc],
] as const) {
  expect(
    `${name} never calls /register`,
    !/\/register\b/.test(code(src)),
    "registering a coexistence number takes it off the owner's phone. There is no undo, no flag, and no way to tell them it was us.",
  );
}

/* -------------------------------------------------------------------------- */
/* 2. The payload from the popup                                               */
/* -------------------------------------------------------------------------- */

const CODE = "AQD".padEnd(40, "x");

const noWaba = embeddedSignupSchema.safeParse({ code: CODE });
expect(
  "a code with no WABA id is accepted",
  noWaba.success,
  "THIS IS THE FIX. Meta often posts no wabaId, the code is still good, and rejecting it costs the owner the whole popup - inside a 30-second window.",
);
expect(
  "a payload with no flow is treated as the ordinary path",
  noWaba.success && noWaba.data.flow === "CLOUD",
  "flow decides one warning, not the connection. A cached page that posts without it must still connect.",
);

const full = embeddedSignupSchema.safeParse({
  code: CODE,
  wabaId: "123456789012",
  phoneNumberId: "987654321098",
  flow: "COEXISTENCE",
});
expect("a complete payload is accepted", full.success);
expect(
  "the coexistence flow survives parsing",
  full.success && full.data.flow === "COEXISTENCE",
);

for (const bad of ["12", "abc", "12345678901234567890123456789", "1'; drop--", "12 34"]) {
  expect(
    `a WABA id of ${JSON.stringify(bad)} is refused`,
    !embeddedSignupSchema.safeParse({ code: CODE, wabaId: bad }).success,
    "these ids are interpolated straight into a Graph path, so anything but digits is refused before it gets there",
  );
}
expect(
  "a non-numeric phone number id is refused",
  !embeddedSignupSchema.safeParse({ code: CODE, phoneNumberId: "abc" }).success,
);
for (const bad of ["", "short"]) {
  expect(
    `a code of ${JSON.stringify(bad)} is refused`,
    !embeddedSignupSchema.safeParse({ code: bad }).success,
  );
}

/* 3. The single-use sync, which must never be chosen by a default. ----------- */

expect("CONTACTS is a sync kind", syncKindSchema.safeParse("CONTACTS").success);
expect("HISTORY is a sync kind", syncKindSchema.safeParse("HISTORY").success);
for (const bad of ["contacts", "ALL", "", "HISTORY ", "CHATS"]) {
  const parsed = syncKindSchema.safeParse(bad);
  expect(
    `a sync kind of ${JSON.stringify(bad)} is refused outright`,
    !parsed.success,
    "it decides WHICH of two single-use requests gets spent. A default here spends the wrong one, and Meta refuses the second.",
  );
}

expect(
  "the sync refuses before it calls Meta",
  /wabaContactsSyncAt[\s\S]{0,400}if \(already\)[\s\S]{0,900}startSmbSync/.test(actionsSrc),
  "the stored timestamp has to be read FIRST. Asking Meta and then noticing is how the one request gets spent on a button somebody pressed twice.",
);
expect(
  "there is exactly one place that asks Meta for a sync",
  actionsSrc.split("startSmbSync(").length - 1 === 1,
  "a second call site is a second way to spend something that cannot be spent twice",
);
expect(
  "a refused sync is not retried",
  !/startSmbSync[\s\S]{0,300}(retry|for \(|while \()/.test(code(actionsSrc)),
  "Meta refuses a second request, so a retry loop turns one refusal into a dead window",
);
expect(
  "the two sync types are Meta's own strings",
  /"smb_app_state_sync" \| "history"/.test(graphSrc),
  "these go on the wire. Prettifying either name is a silent wrong-sync: Meta accepts the request and sends nothing back.",
);
expect(
  "the webhook listens for the same two names",
  /"smb_app_state_sync"/.test(inboundSrc) && /"history"/.test(inboundSrc),
  "the request and the handler are in different files; renaming one leaves an import that arrives and is dropped",
);

/* 4. The connect flow keeps what Meta already granted. ----------------------- */

expect(
  "a missing WABA id is resolved from the token, not refused",
  /if \(!wabaId\)[\s\S]{0,400}listGrantedWabas\(/.test(actionsSrc),
  "the grant itself names the accounts it covers, and it is the authority anyway - the browser message is only a convenience",
);
expect(
  "two granted accounts are reported rather than guessed between",
  /wabaIds\.length === 1 \? [\s\S]{0,600}nothing was saved/.test(actionsSrc),
  "connecting the wrong WABA sends somebody else's customers our messages",
);
expect(
  "a WABA with no number is reported, not stored empty",
  /no phone number on it yet/.test(actionsSrc),
);
expect(
  "two numbers on one account are reported rather than guessed between",
  /phones\.length > 1[\s\S]{0,400}nothing was saved/.test(actionsSrc),
);
expect(
  "a failed app subscription does not throw the token away",
  !/subscribed\.ok\)\s*return/.test(actionsSrc),
  "by then the token is valid and messages would send. Discarding it means asking the business to redo the popup to fix something they cannot see.",
);
expect(
  "the subscription result is still reported",
  /subscribed/.test(actionsSrc.slice(actionsSrc.indexOf("upsertSettings"))),
  "it must not fail the connect AND be silent - the owner needs to know webhooks will not arrive",
);
expect(
  "the graph version is pinned to the connection",
  /graphVersion|version this connection was made against/.test(actionsSrc),
  "a platform-wide version bump must not change the version an existing connection talks to",
);

/* 5. People off a phone carry a source the broadcast guard excludes. --------- */

for (const source of UNCONSENTED_SOURCES) {
  expect(
    `the webhook writes ${source} verbatim`,
    new RegExp(`"${source}"`).test(inboundSrc),
    "verify:contact-consent proves the audience query excludes this exact string. A typo or a rename here means these people quietly become sendable, and the symptom is a LARGER audience, which looks like good news.",
  );
}
expect(
  "a removal from somebody's phone does not delete a contact",
  /removal from somebody's phone is NOT|action/.test(inboundSrc),
  "that person may be a customer with a submission behind them",
);

/* -------------------------------------------------------------------------- */
/* 6. The dashboard readers, driven against canned Meta payloads               */
/* -------------------------------------------------------------------------- */

const realFetch = globalThis.fetch;
let replies: Array<{ match: string; status: number; body: unknown }> = [];
let seen: string[] = [];

globalThis.fetch = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
  seen.push(url);
  const hit = replies.find((r) => url.includes(r.match));
  const status = hit?.status ?? 200;
  return new Response(JSON.stringify(hit?.body ?? {}), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}) as typeof fetch;

const base = { token: "qa-token", version: "v21.0" };

async function readers(): Promise<void> {
  // 6a. An empty answer: every optional field is null, and nothing is invented.
  replies = [];
  const phone = await readPhoneHealth({ ...base, phoneNumberId: "1" });
  expect("an empty phone answer is still a success", phone.ok);
  if (phone.ok) {
    expect(
      "a quality rating Meta did not send is null",
      phone.phone.qualityRating === null,
      `got ${JSON.stringify(phone.phone.qualityRating)}. On the screen this is the difference between "Not reported" and a confident colour.`,
    );
    expect("a status Meta did not send is null", phone.phone.status === null);
    expect("a name status Meta did not send is null", phone.phone.nameStatus === null);
    expect(
      "coexistence is only true when Meta says so",
      phone.phone.isOnBizApp === false,
      "a missing is_on_biz_app must not read as a coexistence number, because only a coexistence number can sync",
    );
  }

  const limits = await readSendingLimits({ ...base, phoneNumberId: "1" });
  expect("an empty limits answer is still a success", limits.ok);
  if (limits.ok) {
    expect(
      "a tier Meta did not send is null, not a zero and not a blank",
      limits.limits.messagingLimitTier === null,
      `got ${JSON.stringify(limits.limits.messagingLimitTier)}`,
    );
    expect("a throughput Meta did not send is null", limits.limits.throughputLevel === null);
  }

  // throughput arrives as an object; an object with no level is still "not reported".
  replies = [{ match: "throughput", status: 200, body: { messaging_limit_tier: "TIER_1K", throughput: {} } }];
  const partial = await readSendingLimits({ ...base, phoneNumberId: "1" });
  expect(
    "a tier Meta DID send survives",
    partial.ok && partial.limits.messagingLimitTier === "TIER_1K",
  );
  expect(
    "an empty throughput object is null, not an empty string",
    partial.ok && partial.limits.throughputLevel === null,
  );

  replies = [];
  const health = await readHealthStatus({ ...base, nodeId: "1" });
  expect("an empty health answer is still a success", health.ok);
  if (health.ok) {
    expect("an unreported sending ability is null", health.health.canSendMessage === null);
    expect("no entities is an empty list", health.health.entities.length === 0);
  }

  // 6b. A sum over no rows IS zero. The deliberate other half of the rule above.
  const totals = await readConversationTotals({ ...base, wabaId: "1", from: new Date(0), to: new Date() });
  expect(
    "a window with no conversations totals zero",
    totals.ok && totals.totals.conversations === 0 && totals.totals.cost === 0,
    "a total is arithmetic over what was returned, not a field Meta withheld - these two cases must not be conflated",
  );

  // 6c. A refusal is a refusal, not an empty result that reads as zero activity.
  replies = [
    {
      match: "template_analytics",
      status: 400,
      body: { error: { message: "Insights are not enabled for this WABA", fbtrace_id: "ABC123" } },
    },
  ];
  const templates = await readTemplateAnalytics({ ...base, wabaId: "1", from: new Date(0), to: new Date() });
  expect(
    "a refused panel fails rather than returning nothing",
    !templates.ok,
    "template analytics is refused until an irreversible switch is thrown. Reporting that as zero sends would have the owner chasing a sending problem that does not exist.",
  );
  if (!templates.ok) {
    expect(
      "Meta's own words reach the screen",
      /Insights are not enabled/.test(templates.error),
      "the owner can act on Meta's sentence; they can do nothing with 'request failed'",
    );
    expect(
      "the trace id is kept",
      /ABC123/.test(templates.error),
      "it is the only thing Meta support will ask for",
    );
  }
}

async function snapshot(): Promise<void> {
  // One panel refused, the rest healthy: the screen must keep what it has.
  replies = [
    {
      match: "template_analytics",
      status: 400,
      body: { error: { message: "Insights are not enabled", fbtrace_id: "T1" } },
    },
    {
      match: "quality_rating",
      status: 200,
      body: { display_phone_number: "+91 90000 00000", verified_name: "QA", quality_rating: "GREEN", status: "CONNECTED" },
    },
  ];
  seen = [];
  const snap = await buildWabaSnapshot({
    phoneNumberId: "1",
    wabaId: "2",
    token: "qa-token",
    version: "v21.0",
    now: new Date("2026-10-27T09:00:00.000Z"),
  });

  expect(
    "one refused panel does not blank the screen",
    snap.phone !== null && snap.phone.qualityRating === "GREEN",
    "every panel is its own request precisely so that one rename at Meta cannot take the whole dashboard down",
  );
  expect("the refused panel is named", typeof snap.problems.templates === "string");
  expect(
    "the refusal says which refusal it was",
    /Insights are not enabled/.test(snap.problems.templates ?? ""),
    "one combined 'could not load' hides the difference between 'not available to you' and 'broken'",
  );
  expect(
    "the panels that answered are not in problems",
    snap.problems.number === undefined,
    "a panel reported as failed when it worked sends somebody to Meta support for nothing",
  );
  expect(
    "the snapshot stores a machine timestamp",
    snap.fetchedAt === new Date(snap.fetchedAt).toISOString(),
    "ISO-8601 UTC in the row; DD-MM-YYYY HH:MM IST is applied at the edge, where a person reads it",
  );
  expect(
    "the window is the one the panels were asked for",
    Math.round((Date.parse(snap.windowTo) - Date.parse(snap.windowFrom)) / 86_400_000) === SNAPSHOT_WINDOW_DAYS,
  );
  expect(
    "health is asked of the phone number, not the account",
    seen.some((u) => u.includes("health_status") && u.includes("/1?")),
    "Meta rolls the answer up FROM the phone number through the WABA and the app. Asking the WABA leaves out the one node the owner can usually fix.",
  );

  // Staleness, which is what puts a refresh button in front of somebody.
  const now = new Date("2026-10-27T10:00:00.000Z");
  expect("a snapshot that was never taken is stale", snapshotIsStale(null, now));
  expect("an unreadable timestamp is stale", snapshotIsStale("not a date", now));
  expect("a snapshot from a minute ago is fresh", !snapshotIsStale("2026-10-27T09:59:00.000Z", now));
  expect("a snapshot from two hours ago is stale", snapshotIsStale("2026-10-27T08:00:00.000Z", now));
}

/* -------------------------------------------------------------------------- */
/* 6. What the popup is asked for                                              */
/* -------------------------------------------------------------------------- */
/**
 * 🔴 TWO VALUES IN `extras`, AND NEITHER FAILS LOUDLY IF IT GOES.
 *
 * featureType is the only reason Meta offers the screen that takes a number already
 * live on somebody's phone. Without it the popup still works, still connects, and
 * hands back a brand new cloud number - the exact opposite of the feature, reported as
 * a success.
 *
 * sessionInfoVersion decides the SHAPE of the messages the component listens for. The
 * handler reads current_step, error_message and FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING,
 * all of which arrive only on version 3, and it read all three for a while without
 * asking for them. Nothing threw: an abandoned popup just stopped saying why, and a
 * coexistence finish stopped being distinguishable from an ordinary one.
 *
 * So the last check is the one that matters most: the fields read and the version asked
 * for have to move together, in either direction.
 */
function popup(): void {
  const src = read("src", "features", "whatsapp", "components", "whatsapp-connect.tsx");
  const body = code(src);

  expect(
    "the popup is asked for the coexistence screen",
    /featureType:\s*"whatsapp_business_app_onboarding"/.test(body),
    "without it Meta runs the clean cloud onboarding and hands back a new number, which is the opposite of this feature and looks like a success",
  );
  expect(
    "the popup is asked for version 3 session info",
    /sessionInfoVersion:\s*"3"/.test(body),
    "the handler reads v3-only fields; on an older shape they never arrive and the silence looks like a page that ignored the click",
  );

  const readsV3 =
    body.includes("current_step") ||
    body.includes("error_message") ||
    body.includes("FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING");
  expect(
    "the fields read and the version asked for agree",
    !readsV3 || /sessionInfoVersion:\s*"3"/.test(body),
    "one of them was changed without the other, so the component is listening for something Meta was never asked to send",
  );
}

async function main(): Promise<void> {
  popup();
  await readers();
  await snapshot();
  globalThis.fetch = realFetch;

  console.log(
    failures === 0
      ? "\n🟢 No register call, a good code is kept, each sync can only be spent once, and a number Meta did not report stays unreported.\n"
      : `\n🔴 ${failures} check(s) failed. One of these costs somebody their number or their connection.\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  globalThis.fetch = realFetch;
  console.error("verify:whatsapp crashed:", e instanceof Error ? e.message : String(e));
  process.exit(1);
});

export {};

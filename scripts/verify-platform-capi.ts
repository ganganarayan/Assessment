/**
 * Assess360 SaaS-funnel CAPI verification (no DB).
 *
 * The bug this guards against leaves no trace at runtime: the platform funnel used to
 * call sendPlatformCapiEvent as `void ….catch(() => {})`, so a signup reached Meta while
 * the app recorded nothing - the Conversions log read 0 whatever Meta received, which
 * is indistinguishable from nobody signing up. Nothing fails, nothing logs; the only
 * symptom is two numbers that will not reconcile. So it is asserted at the source.
 *
 * Also pins the funnel scope strings: both funnels write CapiLog rows with tenantId
 * null and the same standard event names, and only `scope` tells them apart.
 *
 *   npx tsx scripts/verify-platform-capi.ts
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;
const ok = (n: string) => console.log(`  PASS  ${n}`);
const fail = (n: string, d: string) => {
  failures += 1;
  console.log(`  FAIL  ${n}\n        ${d}`);
};
const expect = (n: string, cond: boolean, d = "") => (cond ? ok(n) : fail(n, d));

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

console.log("Platform (SaaS) CAPI verification\n");

const platformEvents = read("src/lib/billing/platform-events.ts");
const capiLog = read("src/lib/meta/capi-log.ts");
const eventsData = read("src/features/events/data.ts");

// --- Every platform send must go through the logging wrapper ---
expect(
  "platform-events routes through sendAndLogPlatformCapi",
  platformEvents.includes("sendAndLogPlatformCapi"),
  "the SaaS funnel must log what it sends Meta",
);
expect(
  "platform-events does NOT call sendPlatformCapiEvent directly",
  !platformEvents.includes("sendPlatformCapiEvent"),
  "a direct send bypasses the CAPI log and the signup becomes invisible again",
);
expect(
  "platform-events has no fire-and-forget send",
  !/void\s+sendAndLogPlatformCapi/.test(platformEvents),
  "`void` discards the outcome, so a failed send would go unrecorded",
);
expect(
  "the trial send is awaited",
  /await sendAndLogPlatformCapi\(\s*\{\s*eventName: "StartTrial"/.test(platformEvents),
  "the row has to exist before fireStartTrial returns",
);
/**
 * 🔴 THE EVENT THIS STEP MUST NOT FIRE.
 *
 * This used to assert that the step sent CompleteRegistration, and it was changed on
 * purpose (153c9b3): the funnel opt-in already fires that name, so two senders were
 * emitting one event name seconds apart for the same person with different event ids.
 * Meta cannot deduplicate those, because they are not the same event. Every lead
 * counted twice and cost per result read about 40% below the truth, which is the kind
 * of wrong number nobody questions because it flatters.
 *
 * So the check is now its own opposite, and that is the point: the regression here is
 * somebody reinstating the name, and the symptom is a metric that looks better.
 */
expect(
  "the platform funnel never fires CompleteRegistration",
  !platformEvents.includes("CompleteRegistration") ||
    !/eventName: "CompleteRegistration"/.test(platformEvents),
  "the funnel opt-in owns that name; a second sender double-counts every lead",
);
expect(
  "purchase send is awaited",
  /await sendAndLogPlatformCapi\(\s*\{\s*eventName: "Purchase"/.test(platformEvents),
);

// --- The wrapper must tag the funnel and never throw into signup/checkout ---
expect('the wrapper writes scope "platform"', /scope: "platform"/.test(capiLog));
expect(
  "the wrapper records an unconfigured platform pixel instead of dropping silently",
  capiLog.includes("Platform pixel / CAPI token not configured in Settings."),
  "an unset pixel must look different from an empty funnel",
);
expect(
  "the wrapper swallows log-write failures",
  /prisma\.capiLog[\s\S]{0,400}?\.catch\(\(\) => \{\}\)/.test(capiLog),
  "tracking must never block a signup or a checkout",
);

// --- The two funnels must stay separated in the log views ---
/**
 * 🟡 Both of these used to read the inline `where` inside listCapiLogs. The scope
 * default and the filter moved into capiLogWhere, which is strictly better - the list
 * and the count behind the pager now cannot drift apart - so the checks follow the
 * behaviour rather than the shape it used to have.
 */
expect(
  "the log query defaults to the assessment funnel",
  /scope: q\.scope \?\? \("assessment" as const\)/.test(eventsData),
  "the existing Conversions views must keep showing respondent events only",
);
expect(
  "both log queries go through the same where",
  (eventsData.match(/where: capiLogWhere\(tenantId, q\)/g) ?? []).length >= 2,
  "without the filter a SaaS signup and an assessment opt-in are the same row, and a count that filters differently from its list pages into nothing",
);

// --- Scope strings are load-bearing: a typo silently splits the log in two, and the
// symptom is an empty view rather than an error ---
const schema = read("prisma/schema.prisma");
expect(
  'the schema default is "assessment"',
  /scope String @default\("assessment"\)/.test(schema),
  "existing rows backfill to the respondent funnel; a different default reassigns them",
);
expect(
  'the migration default matches the schema',
  read("prisma/migrations/20260928010000_capi_log_scope/migration.sql").includes("DEFAULT 'assessment'"),
  "schema and migration defaults must agree or the backfill differs from the model",
);

console.log(`\n${failures === 0 ? "ALL PASS" : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);

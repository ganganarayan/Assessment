/**
 * verify:preview-capi - a preview run never reaches Meta's Conversions API.
 *
 * WHY THIS EXISTS. The owner tests entirely in preview (?preview=1), on production,
 * on the funnel they are about to put ad spend behind. Before 17-10-2026 a preview
 * that reached the result page created a real submission AND fired CompleteRegistration
 * and the completion event, server-side, into the live ad account - teaching it that
 * the owner's own walkthroughs were the people to find more of.
 *
 * Everything else about a preview is real ON PURPOSE: the row, the browser pixel, the
 * page view, the webhook. The owner is checking whether those work and watches them in
 * Pixel Helper. The one thing withheld is the server-side conversion, because Meta
 * cannot tell it from a customer.
 *
 * So the rule has two halves, and BOTH are failures:
 *   1. a preview event that reaches Meta
 *   2. a real event that stops reaching Meta because of this
 *
 * This checks the guard is present at every sender and that the flag is threaded from
 * every place that builds an event. Static, so it cannot be fooled by a mock: it reads
 * the source. No DB, no network, no build.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

let failures = 0;

function expect(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : `  (${detail})`}`);
}

const root = join(__dirname, "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

console.log("Preview never reaches the Conversions API\n");

// --- the shared event shape carries the flag -----------------------------------------
{
  const capi = read("src/lib/meta/capi.ts");
  expect(
    "CapiEventInput has a preview flag",
    /preview\?:\s*boolean/.test(capi),
    "every sender reads it off the event, so one field covers senders added later",
  );
}

// --- 🔴 every sender refuses a preview event -----------------------------------------
{
  const send = read("src/lib/meta/send.ts");
  const senders = ["sendCapiEventVerbose", "sendPlatformCapiEvent", "sendCapiEvent"];
  for (const fn of senders) {
    // The guard must appear AFTER the function opens and BEFORE it builds a request.
    const at = send.indexOf(`export async function ${fn}`);
    expect(`${fn} exists`, at >= 0);
    if (at < 0) continue;
    const body = send.slice(at, at + 1400);
    const guardAt = body.indexOf("if (input.preview)");
    const fetchAt = body.indexOf("fetch(");
    expect(`${fn} refuses a preview event`, guardAt >= 0, "no `if (input.preview)` guard");
    if (guardAt >= 0 && fetchAt >= 0) {
      expect(`${fn} refuses it BEFORE calling Meta`, guardAt < fetchAt, "guard sits after the fetch");
    }
  }
}

// --- the flag is threaded from everywhere an event is built --------------------------
{
  const sub = read("src/features/assessment/actions/submission.ts");
  expect(
    "the registration event carries preview",
    /eventName: metaEventName,\s*\n\s*eventId,\s*\n\s*preview,/.test(sub),
    "CompleteRegistration would reach Meta from a preview",
  );
  expect(
    "the completion event carries preview",
    /eventName: completionEvent,\s*\n\s*eventId,\s*\n\s*preview: full\?\.isPreview === true,/.test(sub),
    "AssessmentCompleted/QualifiedCompletion would reach Meta from a preview",
  );
  expect(
    "the submission remembers it was a preview",
    /isPreview: !!preview,/.test(sub),
    "the completion event fires later and has only the row to read",
  );
  expect(
    "a preview is not metered against the response cap",
    /effectiveSeq == null && !submission\.isPreview/.test(sub),
    "the owner's own testing would spend their customers' quota",
  );

  const track = read("src/features/assessment/actions/track.ts");
  expect(
    "the gate-qualified event carries preview",
    /eventName: GATE_PASSED_EVENT,[\s\S]{0,80}?preview,/.test(track),
  );
  expect(
    "the gate-disqualified event carries preview",
    /eventName,\s*\n\s*preview,/.test(track),
  );
  expect(
    "the gate entry row remembers it was a preview",
    /isPreview: !!preview/.test(track),
    "the abandon sweep reads this row hours later",
  );

  const sweep = read("src/lib/events/abandoned.ts");
  expect(
    "the abandon sweep honours the stored flag",
    /preview: g\.isPreview === true/.test(sweep),
    "a preview would become a retargeting signal overnight",
  );
}

// --- 🔴 the other half: a REAL run must still report ----------------------------------
//
// Guarding too much is the opposite failure and just as expensive - a funnel that
// silently stops reporting conversions looks like an ad problem for weeks.
{
  const send = read("src/lib/meta/send.ts");
  expect(
    "the guard is on input.preview and nothing broader",
    !/if \(preview\)\s*return/.test(send) && /if \(input\.preview\) return/.test(send),
    "a guard that is not keyed on the event would silence real traffic",
  );
  const runner = read("src/features/assessment/components/public/assessment-runner.tsx");
  expect(
    "the runner still passes preview to startSubmission",
    /startSubmission\(assessment\.slug, lead, attribution, preview,/.test(runner),
    "without it the server cannot tell a preview from a respondent",
  );
  // The browser pixel MUST still fire in preview - it is what the owner is watching.
  expect(
    "the browser pixel is not gated on preview",
    /if \(res\.data\?\.status === "started" && res\.data\.eventId\) \{\s*\n\s*pixelTrack\(/.test(runner),
    "Pixel Helper would show nothing and the preview would prove nothing",
  );
}

console.log(
  failures === 0
    ? "\nAll preview-CAPI checks passed.\n"
    : `\n${failures} preview-CAPI check(s) FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);

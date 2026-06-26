/* Verify the pure CRM-send logic: IST window math + custom payload builder. */
import { istHour, inWindow, msUntilWindowOpen, randomDelayMs } from "../src/lib/crm/window";
import { buildCustomPayload, type CustomFieldData } from "../src/lib/crm/custom-fields";

let pass = 0;
let fail = 0;
function expect(name: string, cond: boolean) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}`);
  }
}

// --- inWindow: same-day 9..21 (end exclusive) ---
expect("9-21: 8 closed", inWindow(8, 9, 21) === false);
expect("9-21: 9 open", inWindow(9, 9, 21) === true);
expect("9-21: 20 open", inWindow(20, 9, 21) === true);
expect("9-21: 21 closed (exclusive)", inWindow(21, 9, 21) === false);

// --- inWindow: overnight 21..6 ---
expect("21-6: 22 open", inWindow(22, 21, 6) === true);
expect("21-6: 3 open", inWindow(3, 21, 6) === true);
expect("21-6: 6 closed", inWindow(6, 21, 6) === false);
expect("21-6: 12 closed", inWindow(12, 21, 6) === false);

// --- inWindow: 24h (start==end) ---
expect("equal => 24h open", inWindow(3, 9, 9) === true);

// --- istHour: 03:00 UTC = 08:30 IST => hour 8 ---
expect("istHour 03:00Z = 8", istHour(new Date("2026-06-26T03:00:00.000Z")) === 8);
// 18:30 UTC = 00:00 IST => hour 0
expect("istHour 18:30Z = 0", istHour(new Date("2026-06-26T18:30:00.000Z")) === 0);

// --- msUntilWindowOpen: from 08:30 IST to 9:00 IST = 30 min, lands on hour 9 ---
{
  const now = new Date("2026-06-26T03:00:00.000Z"); // 08:30 IST
  const ms = msUntilWindowOpen(now, 9);
  expect("msUntilOpen 08:30->9 ~30m", Math.abs(ms - 30 * 60_000) < 1000);
  expect("msUntilOpen lands hour 9", istHour(new Date(now.getTime() + ms)) === 9);
}
// from 10:00 IST to next 9:00 IST = ~23h (tomorrow), lands on hour 9
{
  const now = new Date("2026-06-26T04:30:00.000Z"); // 10:00 IST
  const ms = msUntilWindowOpen(now, 9);
  expect("msUntilOpen 10:00->9 next day", ms > 22 * 3600_000 && ms < 24 * 3600_000);
  expect("msUntilOpen next-day lands hour 9", istHour(new Date(now.getTime() + ms)) === 9);
}

// --- randomDelayMs bounds ---
{
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const d = randomDelayMs(10, 12);
    if (d < 10 * 60_000 || d > 12 * 60_000) ok = false;
  }
  expect("randomDelay in [10,12]min", ok);
  expect("randomDelay min==max exact", randomDelayMs(11, 11) === 11 * 60_000);
  expect("randomDelay max<min clamps", randomDelayMs(12, 10) === 12 * 60_000);
}

// --- buildCustomPayload ---
const data: CustomFieldData = {
  name: "Mounika",
  email: "m@example.com",
  phone: "9849985944",
  diagnosis: "Strained",
  scorePercent: 55,
  bandLevel: "MEDIUM",
  scoreRaw: 33,
  scoreMax: 60,
  customerId: "CUST1",
  resultUrl: "https://x/r/1",
  aiStatement: "hello",
  profession: "Home Maker (House Wife)",
};
{
  const p = buildCustomPayload(
    ["contact_name", "contact_email", "contact_phone", "contact.event_type", "contact.assessment_diagnosis"],
    "diagnosis_update",
    data,
  );
  expect("payload has name", p["contact_name"] === "Mounika");
  expect("payload has email", p["contact_email"] === "m@example.com");
  expect("payload has phone", p["contact_phone"] === "9849985944");
  expect("payload event_type = configured", p["contact.event_type"] === "diagnosis_update");
  expect("payload has diagnosis", p["contact.assessment_diagnosis"] === "Strained");
  expect("payload EXCLUDES score (unchecked)", !("contact.assessment_score" in p));
  expect("payload EXCLUDES ai (unchecked)", !("contact.ai_statement" in p));
  expect("payload key count = 5", Object.keys(p).length === 5);
}
{
  const p = buildCustomPayload(["contact.assessment_score", "contact.result_band", "contact_email"], "x", data);
  expect("score selected", p["contact.assessment_score"] === 55);
  expect("band selected", p["contact.result_band"] === "MEDIUM");
  expect("no name when unchecked", !("contact_name" in p));
}
{
  const p = buildCustomPayload(["contact_name", "bogus_field"], "x", data);
  expect("unknown field ignored", !("bogus_field" in p) && p["contact_name"] === "Mounika");
}

console.log(`\n${fail === 0 ? "ALL PASSED" : `${fail} FAILED`}  (${pass} passed)`);
if (fail > 0) process.exit(1);

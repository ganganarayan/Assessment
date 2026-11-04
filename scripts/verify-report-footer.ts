/**
 * The PDF footer rule: Gate prints the Assess360 watermark, anything above removes it.
 *
 *   npm run verify:report-footer
 *
 * Pure, no database.
 */
import { canSetReportFooter, reportFooterLines } from "../src/lib/pdf/footer";

let failures = 0;
function expect(name: string, ok: boolean): void {
  console.log(`${ok ? "🟢" : "🟡"} ${name}`);
  if (!ok) failures += 1;
}

const HOST = "assess360.example.com";
const WATERMARK = `Report by Assess360 · ${HOST}`;
const OWN = "Acme Clinic\nacme.example.com";
const rated = (plan: string | null, unlimited = false, isPlatform = false) => ({ plan, unlimited, isPlatform });
const same = (a: string[], b: string[]) => a.join("\n") === b.join("\n");

expect("Gate prints the Assess360 watermark", same(reportFooterLines(rated("GATE"), null, HOST), [WATERMARK]));
expect("Gate cannot replace it with its own text", same(reportFooterLines(rated("GATE"), OWN, HOST), [WATERMARK]));
expect("a parked tenant reads as Gate", same(reportFooterLines(rated(null), OWN, HOST), [WATERMARK]));
expect("the platform's own reports carry Assess360", same(reportFooterLines(rated(null, true, true), OWN, HOST), [WATERMARK]));

for (const plan of ["SIGNAL", "AGENCY", "ENTERPRISE"]) {
  expect(`${plan} prints no watermark`, same(reportFooterLines(rated(plan), null, HOST), []));
  expect(`${plan} prints its own footer`, same(reportFooterLines(rated(plan), OWN, HOST), ["Acme Clinic", "acme.example.com"]));
}
expect(
  "an internal tenant keeps its own footer",
  same(reportFooterLines(rated(null, true), OWN, HOST), ["Acme Clinic", "acme.example.com"]),
);
expect("blank lines are dropped", same(reportFooterLines(rated("SIGNAL"), "\n a \n\n", HOST), ["a"]));
expect("only Gate and parked are refused the setting", !canSetReportFooter(rated("GATE")) && !canSetReportFooter(rated(null)) && canSetReportFooter(rated("SIGNAL")));

console.log(failures === 0 ? "\n🟢 All checks passed." : `\n🟡 ${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

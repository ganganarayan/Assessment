/**
 * Offline smoke test for the branded PDF report: renders a sample and asserts it
 * is a valid, reasonably-sized PDF. Catches font/register/layout errors before a
 * deploy (react-pdf issues won't show up in typecheck).
 *   npx tsx scripts/verify-report.ts
 */
import { tmpdir } from "os";
import { join } from "path";
import { writeFileSync } from "fs";
import { renderReportPdf } from "../src/lib/pdf/report";

async function main() {
  const buf = await renderReportPdf({
    name: "Swannik Rao",
    profession: "Business Owner",
    assessmentTitle: "Executive Emotional Stability Assessment",
    dateIST: "2026-07-16 09:30",
    scorePercent: 68,
    bandTitle: "Overwhelmed",
    bandLevel: "HIGH",
    aiStatement:
      "Swannik, running a business means the pressure rarely ends when the day does.\n\nOne thing stood out to me: whatever you carry, you have kept it from the people closest to you.\n\nWhat caught my attention was one particular combination of your answers — on its own each looks ordinary, together they change how I read the rest.",
    resultSuggestion: "This sits in the higher range. It is getting heavy, and now is the moment to act.",
    categories: [
      { name: "Inner Pressure & Mental Burden", score: 11, max: 12, band: "Critical" },
      { name: "Relationships & Presence", score: 4, max: 12, band: "Present" },
      { name: "Meaning & Inner Stability", score: 9, max: 12, band: "High" },
    ],
  });

  const isPdf = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const out = join(tmpdir(), "assess-report-sample.pdf");
  writeFileSync(out, buf);
  console.log(`[verify-report] bytes=${buf.length} isPdf=${isPdf} -> ${out}`);
  if (!isPdf || buf.length < 1000) {
    console.error("[verify-report] NOT a valid PDF");
    process.exit(1);
  }
  if (buf.length > 1_500_000) {
    console.error(`[verify-report] PDF exceeds 1.5 MB budget (${buf.length})`);
    process.exit(1);
  }
  console.log("[verify-report] OK");
}

main().catch((e) => {
  console.error("[verify-report] failed:", e);
  process.exit(1);
});

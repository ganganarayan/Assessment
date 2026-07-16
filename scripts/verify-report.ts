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
    reportNote:
      "From our call: 1) 20-minute morning walk with no phone, daily.\n\n2) One honest conversation with your co-founder about the load you carry.\n\n3) Retake this in 15 days — we compare and adjust.",
    categories: [
      {
        name: "Inner Pressure & Mental Burden",
        score: 11,
        max: 12,
        band: "Critical",
        questions: [
          { text: "Even when things appear successful, I feel a constant pressure inside that rarely leaves me.", answer: "Often", score: 3, max: 4 },
          { text: "I often feel responsible for everyone else's problems while carrying my own alone.", answer: "Very Often", score: 4, max: 4 },
          { text: "I replay conversations and mistakes long after the situation is over.", answer: "Often", score: 3, max: 4 },
        ],
      },
      {
        name: "Relationships & Presence",
        score: 4,
        max: 12,
        band: "Present",
        questions: [
          { text: "The people I love receive the leftovers of my energy.", answer: "Rarely", score: 1, max: 4 },
          { text: "I am physically present with family but mentally occupied elsewhere.", answer: "Sometimes", score: 2, max: 4 },
          { text: "My stress has negatively affected people close to me.", answer: "Rarely", score: 1, max: 4 },
        ],
      },
      {
        name: "Meaning & Inner Stability",
        score: 9,
        max: 12,
        band: "High",
        questions: [
          { text: "Despite everything I have achieved, I feel an unexplained emptiness.", answer: "Often", score: 3, max: 4 },
          { text: "My contentment depends on achieving something external.", answer: "Often", score: 3, max: 4 },
          { text: "I worry what continuing like this will cost me in five years.", answer: "Often", score: 3, max: 4 },
        ],
      },
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

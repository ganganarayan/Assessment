/**
 * Offline smoke test for the clinic-audit branded PDF report: renders a sample and
 * asserts it is a valid, reasonably-sized PDF. Catches font/register/layout errors
 * before a deploy (react-pdf issues won't show up in typecheck).
 *   npx tsx scripts/verify-clinic-report.ts
 */
import { renderClinicReportPdf } from "../src/lib/pdf/clinic-report";
import { DEFAULT_ENGINE_CONFIG, computeResult, deriveInputs } from "../src/lib/scoring/clinic-audit";

async function main() {
  const inputs = deriveInputs(
    [
      // No actual number typed — range midpoint used, tagged "assumed — avg of X"
      // on the PDF (exercises that render path).
      { role: "ENQUIRIES", value: 20, optionLabel: "Under 30" },
      { role: "BOOK_RATE", value: 12, optionLabel: "Under 15" },
      { role: "SHOWUP_RATE", value: 35, optionLabel: "Fewer than 5" },
      // An actual number WAS typed — must be used verbatim and never tagged.
      { role: "CLOSE_RATE", value: 30, actualValue: 33, optionLabel: "2 or 3" },
      { role: "TREATMENT_VALUE", value: 112000, optionLabel: "₹60,000–₹1,20,000" },
      { role: "AD_SPEND", value: 15000 },
      { role: "DORMANT", value: 1500, optionLabel: "More than 1,000" },
      { role: "CAPACITY", value: 10 },
      { role: "UPLIFT_BOOKRATE", value: 6, clause: "slow first reply" },
      { role: "UPLIFT_BOOKRATE", value: 6, clause: "no structured follow-up" },
    ],
    DEFAULT_ENGINE_CONFIG,
  );
  const result = computeResult(inputs, DEFAULT_ENGINE_CONFIG);
  // Guard the offer block: if netGain is not positive the verdict never renders and
  // this smoke test silently stops covering it (a font/style fault there would ship).
  if (!(result.performance.netGain > 0)) {
    console.error("  fixture must produce a positive netGain to exercise the verdict: FAIL");
    process.exit(1);
  }
  console.log("  fixture exercises the offer verdict: PASS");

  const buf = await renderClinicReportPdf({
    name: "Ganesh Test Patro",
    profession: "Hair Transplant Clinic",
    assessmentTitle: "Where does your clinic actually lose patients?",
    dateIST: "2026-08-14 13:51",
    result,
    prose:
      "### Where you stand\nYour clinic earns roughly the figures shown above from its current enquiries.\n\n### What is producing the gap\nResponse speed and follow-up depth are both costing bookings.",
    bookingUrl: "https://cal.com/example/intro",
    costPerEnquiry: DEFAULT_ENGINE_CONFIG.costPerEnquiry,
  });

  const okHeader = buf.subarray(0, 5).toString("latin1") === "%PDF-";
  const okSize = buf.length > 2000;
  console.log(`  header %PDF-: ${okHeader ? "PASS" : "FAIL"}`);
  console.log(`  size ${buf.length} bytes > 2000: ${okSize ? "PASS" : "FAIL"}`);
  process.exit(okHeader && okSize ? 0 : 1);
}

main().catch((e) => {
  console.error("FAIL — threw:", e);
  process.exit(1);
});

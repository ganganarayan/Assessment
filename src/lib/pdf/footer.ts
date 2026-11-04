/**
 * What a PDF report prints in its footer, as a rule.
 *
 * Gate carries the Assess360 watermark, and removing it is part of what the higher plans
 * buy. Above Gate the footer is whatever the tenant wrote in Settings, which may be
 * nothing at all. The platform's own reports are Assess360's, so they carry its name.
 *
 * Pure, so `verify:report-footer` can assert it in the build. A parked tenant has no plan
 * and reads as Gate: nothing it stopped paying for should still be switched on.
 */

export interface ReportFooterPlan {
  plan: string | null;
  unlimited: boolean;
  isPlatform: boolean;
}

/** May this tenant replace the watermark with its own footer? */
export function canSetReportFooter(rated: ReportFooterPlan): boolean {
  if (rated.isPlatform) return false;
  return rated.unlimited || (rated.plan !== null && rated.plan !== "GATE");
}

export function reportFooterLines(
  rated: ReportFooterPlan,
  ownFooter: string | null | undefined,
  platformHost: string,
): string[] {
  if (!canSetReportFooter(rated)) return [`Report by Assess360 · ${platformHost}`];
  return (ownFooter ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

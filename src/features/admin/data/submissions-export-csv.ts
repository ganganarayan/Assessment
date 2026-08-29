import { type SubmissionExportRow } from "@/features/admin/data/submissions-export";
import { type CsvColumn } from "@/lib/csv";

/** Flat, one-row-per-submission shape for the CSV export (categories + AI
 *  versions collapsed into single cells; JSON export keeps them nested). */
export interface SubmissionExportFlatRow {
  submissionId: string;
  customerId: string;
  assessment: string;
  status: string;
  created: string;
  completed: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  profession: string;
  customDetails: string;
  score: string | number;
  max: string | number;
  percent: string | number;
  overallBand: string;
  overallLevel: string;
  paidAmount: string | number;
  paidAt: string;
  resultUrl: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  fbclid: string;
  gclid: string;
  device_type: string;
  browser: string;
  os: string;
  country: string;
  city: string;
  region: string;
  postal_code: string;
  timezone: string;
  categories: string;
  aiDefault: string;
  aiVersions: string;
}

export const SUBMISSION_EXPORT_COLUMNS: CsvColumn<SubmissionExportFlatRow>[] = [
  { key: "submissionId", label: "Submission ID" },
  { key: "customerId", label: "Customer ID" },
  { key: "assessment", label: "Assessment" },
  { key: "status", label: "Status" },
  { key: "created", label: "Created (IST)" },
  { key: "completed", label: "Completed (IST)" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "profession", label: "Profession" },
  { key: "customDetails", label: "Custom details" },
  { key: "score", label: "Score" },
  { key: "max", label: "Max" },
  { key: "percent", label: "Percent" },
  { key: "overallBand", label: "Overall band" },
  { key: "overallLevel", label: "Overall level" },
  { key: "paidAmount", label: "Paid amount (₹)" },
  { key: "paidAt", label: "Paid at (IST)" },
  { key: "resultUrl", label: "Result link" },
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_term", label: "utm_term" },
  { key: "utm_content", label: "utm_content" },
  { key: "fbclid", label: "fbclid" },
  { key: "gclid", label: "gclid" },
  { key: "device_type", label: "device_type" },
  { key: "browser", label: "browser" },
  { key: "os", label: "os" },
  { key: "country", label: "country" },
  { key: "city", label: "city" },
  { key: "region", label: "region" },
  { key: "postal_code", label: "postal_code" },
  { key: "timezone", label: "timezone" },
  { key: "categories", label: "Category results" },
  { key: "aiDefault", label: "AI message (default)" },
  { key: "aiVersions", label: "AI versions (all)" },
];

export function flattenSubmissionExportRow(r: SubmissionExportRow): SubmissionExportFlatRow {
  return {
    submissionId: r.submissionId,
    customerId: r.customerId ?? "",
    assessment: r.assessmentTitle,
    status: r.status,
    created: r.createdAtIST,
    completed: r.completedAtIST ?? "",
    firstName: r.firstName ?? "",
    lastName: r.lastName ?? "",
    email: r.email ?? "",
    phone: r.phone ?? "",
    profession: r.profession ?? "",
    customDetails: r.customDetails ?? "",
    score: r.scoreRaw ?? "",
    max: r.max ?? "",
    percent: r.scorePercent ?? "",
    overallBand: r.overallBand ?? "",
    overallLevel: r.overallBandLevel ?? "",
    paidAmount: r.paidAmount ?? "",
    paidAt: r.paidAtIST ?? "",
    resultUrl: r.resultUrl ?? "",
    utm_source: r.utm_source ?? "",
    utm_medium: r.utm_medium ?? "",
    utm_campaign: r.utm_campaign ?? "",
    utm_term: r.utm_term ?? "",
    utm_content: r.utm_content ?? "",
    fbclid: r.fbclid ?? "",
    gclid: r.gclid ?? "",
    device_type: r.device_type ?? "",
    browser: r.browser ?? "",
    os: r.os ?? "",
    country: r.country ?? "",
    city: r.city ?? "",
    region: r.region ?? "",
    postal_code: r.postal_code ?? "",
    timezone: r.timezone ?? "",
    categories: r.categories
      .map((c) => `${c.name}: ${c.score}/${c.max}${c.band ? ` (${c.band})` : ""}`)
      .join(" | "),
    aiDefault: r.aiStatements.find((s) => s.isDefault)?.text ?? "",
    aiVersions: r.aiStatements
      .map(
        (s, i) =>
          `v${i + 1} [${s.source}${s.isDefault ? ", default" : ""}]` +
          `${s.instruction ? ` {${s.instruction}}` : ""}: ${s.text}`,
      )
      .join("  |||  "),
  };
}

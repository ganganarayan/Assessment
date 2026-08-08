import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  listSubmissionsForExport,
  type SubmissionExportRow,
} from "@/features/admin/data/submissions-export";
import { EXPORT_CAP } from "@/features/admin/data/analytics";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { formatIST } from "@/lib/date";

/**
 * Super-admin submissions export. GET /api/admin/submissions/export?format=csv|json
 * — every submission with its full result: score, overall band, UTMs, all
 * category results, and ALL AI-statement versions. JSON keeps these nested; CSV
 * flattens categories + versions into single cells (one row per submission).
 */
export const dynamic = "force-dynamic";

interface FlatRow {
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
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_term: string;
  utm_content: string;
  fbclid: string;
  gclid: string;
  categories: string;
  aiDefault: string;
  aiVersions: string;
}

const COLUMNS: CsvColumn<FlatRow>[] = [
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
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_term", label: "utm_term" },
  { key: "utm_content", label: "utm_content" },
  { key: "fbclid", label: "fbclid" },
  { key: "gclid", label: "gclid" },
  { key: "categories", label: "Category results" },
  { key: "aiDefault", label: "AI message (default)" },
  { key: "aiVersions", label: "AI versions (all)" },
];

function flatten(r: SubmissionExportRow): FlatRow {
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
    utm_source: r.utm_source ?? "",
    utm_medium: r.utm_medium ?? "",
    utm_campaign: r.utm_campaign ?? "",
    utm_term: r.utm_term ?? "",
    utm_content: r.utm_content ?? "",
    fbclid: r.fbclid ?? "",
    gclid: r.gclid ?? "",
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

export async function GET(req: Request) {
  await requireSuperAdmin();

  const format = new URL(req.url).searchParams.get("format") === "json" ? "json" : "csv";
  const rows = await listSubmissionsForExport();
  const stamp = formatIST(new Date()).slice(0, 10);
  const capped = rows.length >= EXPORT_CAP;
  if (capped) console.warn(`[submissions-export] capped at ${EXPORT_CAP} rows`);
  const extra: Record<string, string> = capped ? { "x-export-capped": String(EXPORT_CAP) } : {};

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="submissions-${stamp}.json"`,
        "cache-control": "no-store",
        ...extra,
      },
    });
  }

  return new NextResponse(toCsv(rows.map(flatten), COLUMNS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="submissions-${stamp}.csv"`,
      "cache-control": "no-store",
      ...extra,
    },
  });
}

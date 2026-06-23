import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listContactsForExport, EXPORT_CAP, type ContactExportRow } from "@/features/admin/data/analytics";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { formatIST } from "@/lib/date";

/**
 * Super-admin contacts export. GET /api/admin/contacts/export?format=csv|json
 * &from=&to= — returns ALL contacts in the date range (else all-time) as an
 * attachment. Name/email/phone are separate columns.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<ContactExportRow>[] = [
  { key: "optInDateIST", label: "Opt-in date (IST)" },
  { key: "firstName", label: "First name" },
  { key: "lastName", label: "Last name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "profession", label: "Profession" },
  { key: "completed", label: "Completed" },
  { key: "vslLoaded", label: "VSL loaded" },
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_term", label: "utm_term" },
  { key: "utm_content", label: "utm_content" },
  { key: "fbclid", label: "fbclid" },
  { key: "gclid", label: "gclid" },
];

export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const rows = await listContactsForExport({ from, to });
  const stamp = formatIST(new Date()).slice(0, 10); // YYYY-MM-DD (IST)

  // Signal (and log) if the safety cap truncated the export, so a partial file
  // is never mistaken for the complete set.
  const capped = rows.length >= EXPORT_CAP;
  if (capped) {
    console.warn(`[contacts-export] capped at ${EXPORT_CAP} rows (from=${from ?? ""} to=${to ?? ""})`);
  }
  const extra: Record<string, string> = capped ? { "x-export-capped": String(EXPORT_CAP) } : {};

  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="contacts-${stamp}.json"`,
        "cache-control": "no-store",
        ...extra,
      },
    });
  }

  return new NextResponse(toCsv(rows, COLUMNS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="contacts-${stamp}.csv"`,
      "cache-control": "no-store",
      ...extra,
    },
  });
}

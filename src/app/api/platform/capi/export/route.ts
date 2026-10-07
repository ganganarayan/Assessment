import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { listCapiLogs } from "@/features/events/data";
import { getStatsFloor } from "@/lib/stats-floor";
import { istDateRangeToUtc, formatIST } from "@/lib/date";
import { toCsv, type CsvColumn } from "@/lib/csv";

/**
 * Export the SaaS funnel's Conversions API sends.
 * GET /api/platform/capi/export?format=csv|json&from=&to=
 *
 * This log is the only record of what an ad account will count as a registration, so
 * reconciling it against Ads Manager is the whole point of having it - and that is work
 * done in a spreadsheet, not by scrolling a table that grows by one row per signup.
 *
 * Windowed exactly like the page: the platform Data window is the floor and From/To
 * narrows within it, so an export always matches the screen it was taken from.
 */
export const dynamic = "force-dynamic";

/** Hard ceiling, so one request can never try to serialise the whole table. */
const EXPORT_CAP = 5000;

interface CapiExportRow {
  timeIST: string;
  eventName: string;
  email: string | null;
  phone: string | null;
  name: string | null;
  status: string;
  httpStatus: number | null;
  matched: string;
  autoFired: string;
  amountRupees: number | null;
  currency: string;
  providerPaymentId: string | null;
  response: string | null;
}

const COLUMNS: CsvColumn<CapiExportRow>[] = [
  { key: "timeIST", label: "Time (IST)" },
  { key: "eventName", label: "Event" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "name", label: "Name" },
  { key: "status", label: "Status" },
  { key: "httpStatus", label: "HTTP" },
  { key: "matched", label: "Matched" },
  { key: "autoFired", label: "Auto-fired" },
  { key: "amountRupees", label: "Amount (INR)" },
  { key: "currency", label: "Currency" },
  { key: "providerPaymentId", label: "Payment id" },
  { key: "response", label: "Meta said" },
];

export async function GET(req: Request): Promise<NextResponse> {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;

  const floor = await getStatsFloor(null);
  const { gte, lte } = istDateRangeToUtc(from, to);

  const logs = await listCapiLogs(null, {
    scope: "platform",
    take: EXPORT_CAP,
    floor,
    gte,
    lte,
  });

  const rows: CapiExportRow[] = logs.map((r) => ({
    timeIST: formatIST(r.createdAt),
    eventName: r.eventName,
    email: r.email,
    phone: r.phone,
    name: r.name,
    status: r.status,
    httpStatus: r.httpStatus,
    matched: r.matched ? "yes" : "no",
    autoFired: r.autoFired ? "auto" : "manual",
    amountRupees: r.amountRupees,
    currency: r.currency,
    providerPaymentId: r.providerPaymentId,
    response: r.response,
  }));

  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "json") {
    return new NextResponse(JSON.stringify(rows, null, 2), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "content-disposition": `attachment; filename="assess360-saas-capi-${stamp}.json"`,
      },
    });
  }
  return new NextResponse(toCsv(rows, COLUMNS), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="assess360-saas-capi-${stamp}.csv"`,
    },
  });
}

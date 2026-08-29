import { NextResponse } from "next/server";
import { requireSuperAdmin } from "@/lib/auth/guards";
import {
  getUtmBreakdown,
  listPageViews,
  EXPORT_CAP,
  type UtmBreakdownRow,
} from "@/features/admin/data/analytics";
import { toCsv, type CsvColumn } from "@/lib/csv";
import { formatIST } from "@/lib/date";

/**
 * Super-admin Stats export. GET /api/admin/stats/export?dataset=utm|pageviews
 * &format=csv|json&from=&to= — exports the two Stats tables (traffic by UTM, or
 * the per-visit page-view log) for the date range (else all-time).
 */
export const dynamic = "force-dynamic";

const UTM_COLUMNS: CsvColumn<UtmBreakdownRow>[] = [
  { key: "source", label: "utm_source" },
  { key: "medium", label: "utm_medium" },
  { key: "campaign", label: "utm_campaign" },
  { key: "term", label: "utm_term" },
  { key: "content", label: "utm_content" },
  { key: "views", label: "Views" },
];

interface PageViewExport {
  timeIST: string;
  bot: string;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  fbclid: string | null;
  gclid: string | null;
  ip: string | null;
  user_agent: string | null;
  device_type: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  postal_code: string | null;
  timezone: string | null;
}
const PAGEVIEW_COLUMNS: CsvColumn<PageViewExport>[] = [
  { key: "timeIST", label: "Time (IST)" },
  { key: "bot", label: "bot" },
  { key: "utm_source", label: "utm_source" },
  { key: "utm_medium", label: "utm_medium" },
  { key: "utm_campaign", label: "utm_campaign" },
  { key: "utm_term", label: "utm_term" },
  { key: "utm_content", label: "utm_content" },
  { key: "fbclid", label: "fbclid" },
  { key: "gclid", label: "gclid" },
  { key: "ip", label: "ip" },
  { key: "user_agent", label: "user_agent" },
  { key: "device_type", label: "device_type" },
  { key: "browser", label: "browser" },
  { key: "os", label: "os" },
  { key: "country", label: "country" },
  { key: "city", label: "city" },
  { key: "region", label: "region" },
  { key: "postal_code", label: "postal_code" },
  { key: "timezone", label: "timezone" },
];

export async function GET(req: Request) {
  await requireSuperAdmin();

  const url = new URL(req.url);
  const dataset = url.searchParams.get("dataset") === "pageviews" ? "pageviews" : "utm";
  const format = url.searchParams.get("format") === "json" ? "json" : "csv";
  const from = url.searchParams.get("from") ?? undefined;
  const to = url.searchParams.get("to") ?? undefined;
  const stamp = formatIST(new Date()).slice(0, 10);

  const send = (body: string, type: string, name: string, capped: boolean) =>
    new NextResponse(body, {
      headers: {
        "content-type": type,
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
        ...(capped ? { "x-export-capped": String(EXPORT_CAP) } : {}),
      },
    });

  if (dataset === "pageviews") {
    const log = await listPageViews({ from, to, limit: EXPORT_CAP, includeBots: true });
    const rows: PageViewExport[] = log.map((r) => ({
      timeIST: formatIST(r.createdAt),
      bot: r.isBot ? "yes" : "no",
      utm_source: r.source,
      utm_medium: r.medium,
      utm_campaign: r.campaign,
      utm_term: r.term,
      utm_content: r.content,
      fbclid: r.fbclid,
      gclid: r.gclid,
      ip: r.ip,
      user_agent: r.userAgent,
      device_type: r.deviceType,
      browser: r.browser,
      os: r.os,
      country: r.country,
      city: r.city,
      region: r.region,
      postal_code: r.postalCode,
      timezone: r.timezone,
    }));
    const capped = rows.length >= EXPORT_CAP;
    if (capped) console.warn(`[stats-export] page-view log capped at ${EXPORT_CAP}`);
    if (format === "json") {
      return send(JSON.stringify(rows, null, 2), "application/json; charset=utf-8", `page-view-log-${stamp}.json`, capped);
    }
    return send(toCsv(rows, PAGEVIEW_COLUMNS), "text/csv; charset=utf-8", `page-view-log-${stamp}.csv`, capped);
  }

  const rows = await getUtmBreakdown({ from, to });
  if (format === "json") {
    return send(JSON.stringify(rows, null, 2), "application/json; charset=utf-8", `traffic-by-utm-${stamp}.json`, false);
  }
  return send(toCsv(rows, UTM_COLUMNS), "text/csv; charset=utf-8", `traffic-by-utm-${stamp}.csv`, false);
}

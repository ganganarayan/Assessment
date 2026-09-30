import {
  getAnalyticsStats,
  getUtmBreakdown,
  listPageViews,
  getBotSourceRows,
} from "@/features/admin/data/analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { AssessmentPicker } from "@/features/admin/components/assessment-picker";
import { getAssessmentForAnalytics, listAssessments } from "@/features/assessment/data";
import { formatIST } from "@/lib/date";
import { getStatsFloor } from "@/lib/stats-floor";
import { actingTenantId, actingDataScope } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";

const dash = (v: string | null) => (v && v.trim() ? v : "—");

/** Join non-empty parts with a separator; em-dash when all are blank. */
const join = (parts: (string | null)[], sep: string) => {
  const s = parts.filter((p) => p && p.trim()).join(sep);
  return s || "—";
};

/** Page-1 gate outcome for one visitor. "—" = they never answered page 1 at all,
 *  which is the row that explains views without opt-ins. */
const GateCell = ({ gate }: { gate: "qualified" | "disqualified" | "disqualified_repeat" | null }) => {
  if (gate === "qualified") return <span className="text-xs font-medium text-green-600">Qualified</span>;
  if (gate === "disqualified") return <span className="text-xs font-medium text-yellow-600">Disqualified</span>;
  if (gate === "disqualified_repeat")
    return <span className="text-xs font-medium text-yellow-600 opacity-70">Disqualified (revisit)</span>;
  return <span className="text-xs text-[var(--muted-foreground)]">—</span>;
};

const BotTag = () => (
  <span className="rounded bg-[var(--muted)] px-1.5 py-0.5 text-xs font-medium text-[var(--muted-foreground)]">
    bot
  </span>
);

export default async function StatsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; assessment?: string }>;
}) {
  const sp = await searchParams;
  // Two different questions, two different answers (see lib/tenant/acting):
  //   t          — which workspace is entered, if any (assessment lookup, data window)
  //   dataScope  — which rows to REPORT on; no workspace entered = every tenant
  const t = await actingTenantId();
  const dataScope = await actingDataScope();
  const scoped = sp.assessment ? await getAssessmentForAnalytics(sp.assessment, dataScope) : null;
  // Scoped: the assessment's saved reporting start (statsResetAt, applied via aScope
  // floor) IS the "from", so the URL from is ignored. To stays an ad-hoc end date.
  const range = { from: scoped ? undefined : sp.from, to: sp.to };
  const stickyStart = scoped?.statsResetAt ? formatIST(scoped.statsResetAt.toISOString()).split(" ")[0] : "";
  const assessmentOptions = (await listAssessments(dataScope)).map((a) => ({ id: a.id, title: a.title }));
  const aScope = scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : undefined;
  const pvScope = scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : {};
  const [s, utm, log, botRows] = await Promise.all([
    getAnalyticsStats(range, dataScope, aScope),
    getUtmBreakdown(range, dataScope, aScope),
    listPageViews({ ...range, limit: 100, scope: dataScope, ...pvScope }),
    getBotSourceRows({ ...range, scope: dataScope, ...pvScope }),
  ]);

  const items: { label: string; value: number; hint?: string }[] = [
    { label: "Opt-in page views", value: s.totalViews },
    { label: "Unique opt-in views", value: s.uniqueViews },
    // The two gate outcomes sit between views and opt-ins because that is where the
    // gate acts: everyone who answered page 1 is one or the other, and the shortfall
    // against unique views is people who left without answering at all. Both stay 0 on
    // an ungated funnel, so they never add noise where there is no gate.
    { label: "Qualified (passed gate)", value: s.qualified, hint: "Answered page 1 and were let through." },
    {
      label: "Turned away by gate",
      value: s.disqualified,
      hint:
        s.disqualifiedRepeat > 0
          ? `+${s.disqualifiedRepeat.toLocaleString()} revisit${s.disqualifiedRepeat === 1 ? "" : "s"} by someone already rejected`
          : undefined,
    },
    { label: "Opted in", value: s.optins },
    { label: "Completed assessment", value: s.completed },
    { label: "VSL loads (result shown)", value: s.vslLoads },
  ];

  // The reporting floor actually applied (mirrors createdAtScope): the assessment's
  // own Data window when scoped, else the global one (skipped while impersonating).
  const effectiveFloor: Date | null = scoped ? scoped.statsResetAt : await getStatsFloor(t);
  const scopeLabel = scoped ? "Funnel numbers for this assessment" : "Funnel numbers across all assessments";
  const note = scoped
    ? `${scopeLabel} from ${stickyStart || "the beginning"}${sp.to ? ` → ${sp.to}` : ""} (IST) — saved for this assessment.`
    : sp.from || sp.to
      ? `Showing ${sp.from ?? "start"} → ${sp.to ?? "today"} (IST).`
      : effectiveFloor
        ? `${scopeLabel} from ${formatIST(effectiveFloor.toISOString())} IST onward (Data window).`
        : `${scopeLabel} (all time).`;

  const exportHref = (dataset: string, format: string) => {
    const p = new URLSearchParams();
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    p.set("dataset", dataset);
    p.set("format", format);
    return `/api/admin/stats/export?${p.toString()}`;
  };
  const exportGroups = [
    {
      label: "Traffic by UTM",
      items: [
        { label: "CSV", href: exportHref("utm", "csv") },
        { label: "JSON", href: exportHref("utm", "json") },
      ],
    },
    {
      label: "Page-view log",
      items: [
        { label: "CSV", href: exportHref("pageviews", "csv") },
        { label: "JSON", href: exportHref("pageviews", "json") },
      ],
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Stats</h1>
          <p className="text-sm text-[var(--muted-foreground)]">{note}</p>
        </div>
        <AnalyticsToolbar exportGroups={exportGroups} />
      </div>

      <AssessmentPicker assessments={assessmentOptions} selectedId={scoped?.id ?? null} basePath="/admin/analytics/stats" />

      <DateRangeFilter
        basePath="/admin/analytics/stats"
        from={sp.from}
        to={sp.to}
        extraQuery={scoped ? { assessment: scoped.id } : undefined}
        stickyStartAssessmentId={scoped?.id}
        stickyStartValue={stickyStart}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((it) => (
          <Card key={it.label}>
            <CardHeader>
              <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">
                {it.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold tabular-nums">{it.value.toLocaleString()}</p>
              {it.hint ? <p className="text-sm text-[var(--muted-foreground)]">{it.hint}</p> : null}
            </CardContent>
          </Card>
        ))}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-[var(--muted-foreground)]">Paid</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-4xl font-bold tabular-nums text-green-600">{s.paidCount.toLocaleString()}</p>
            <p className="text-sm text-[var(--muted-foreground)]">₹{s.paidAmount.toLocaleString()} total</p>
          </CardContent>
        </Card>
      </div>

      {/* Events actually sent to Meta, as running counts. The numbers above are
          PEOPLE; these are EVENTS — one visitor can be reported more than once when
          audience membership is renewed, which is why Meta's number is the higher one. */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Fired to Meta</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Conversions API sends from this funnel — events, not people. Compare these with the same
            event names in Events Manager; your custom audiences are built on them.
          </p>
        </div>
        {s.fired.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nothing fired in this window.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5">Event</th>
                  <th className="px-3 py-1.5 text-right">Accepted</th>
                  <th className="px-3 py-1.5 text-right">Failed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {s.fired.map((f) => (
                  <tr key={f.eventName}>
                    <td className="whitespace-nowrap px-3 py-2 font-medium">{f.eventName}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{f.count.toLocaleString()}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${f.failed > 0 ? "text-yellow-600" : "text-[var(--muted-foreground)]"}`}>
                      {f.failed.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Traffic by UTM — how many page views came from which source. */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Traffic by UTM</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Page views grouped by campaign tags. Populates before any lead opts in.
          </p>
        </div>
        {utm.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No page views yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="px-3 py-1.5">Source</th>
                  <th className="px-3 py-1.5">Medium</th>
                  <th className="px-3 py-1.5">Campaign</th>
                  <th className="px-3 py-1.5">Term</th>
                  <th className="px-3 py-1.5">Content</th>
                  <th className="px-3 py-1.5 text-right">Views</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {utm.map((r) => (
                  <tr key={[r.source, r.medium, r.campaign, r.term, r.content].join("|")}>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.source)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.medium)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.campaign)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.term)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.content)}</td>
                    <td className="px-3 py-2 text-right font-medium tabular-nums">
                      {r.views.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Live page-view log — one row per visit, IST timestamp + UTMs, no lead. */}
      <section className="flex flex-col gap-2">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Page-view log</h2>
          <p className="text-sm text-[var(--muted-foreground)]">
            Latest {log.length.toLocaleString()} human visits. A visitor becomes a contact once
            they opt in — they then appear with lead data on Contacts. Automated hits (Meta
            ad-review, crawlers) are clubbed by source into the <BotTag /> rows below and excluded
            from every number above.
          </p>
        </div>
        {log.length === 0 && botRows.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">No page views yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <th className="whitespace-nowrap px-3 py-1.5">Time (IST)</th>
                  <th className="whitespace-nowrap px-3 py-1.5">Gate</th>
                  <th className="px-3 py-1.5">Source</th>
                  <th className="px-3 py-1.5">Medium</th>
                  <th className="px-3 py-1.5">Campaign</th>
                  <th className="px-3 py-1.5">Term</th>
                  <th className="px-3 py-1.5">Content</th>
                  <th className="px-3 py-1.5">fbclid</th>
                  <th className="px-3 py-1.5">gclid</th>
                  <th className="px-3 py-1.5">IP</th>
                  <th className="px-3 py-1.5">Device</th>
                  <th className="px-3 py-1.5">Location</th>
                  <th className="px-3 py-1.5">User-Agent</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {log.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      {formatIST(r.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <GateCell gate={r.gate} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.source)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.medium)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.campaign)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.term)}</td>
                    <td className="whitespace-nowrap px-3 py-2">{dash(r.content)}</td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs" title={r.fbclid ?? ""}>
                      {dash(r.fbclid)}
                    </td>
                    <td className="max-w-[140px] truncate px-3 py-2 text-xs" title={r.gclid ?? ""}>
                      {dash(r.gclid)}
                    </td>
                    <td className="max-w-[120px] truncate px-3 py-2 text-xs" title={r.ip ?? ""}>
                      {dash(r.ip)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {join([r.deviceType, r.browser, r.os], " · ")}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {join([r.city, r.region, r.country], ", ")}
                    </td>
                    <td className="max-w-[240px] truncate px-3 py-2 text-xs text-[var(--muted-foreground)]" title={r.userAgent ?? ""}>
                      {dash(r.userAgent)}
                    </td>
                  </tr>
                ))}
                {/* Bots clubbed by source, always sorted below the human rows. */}
                {botRows.map((b) => (
                  <tr key={`bot:${b.source}`} className="bg-[var(--muted)]/40">
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      <div>{formatIST(b.lastAt)}</div>
                      <div className="opacity-70">first {formatIST(b.firstAt)}</div>
                    </td>
                    <td className="px-3 py-2" />
                    <td className="whitespace-nowrap px-3 py-2">
                      <BotTag />{" "}
                      <span className="text-xs font-medium">{b.source}</span>{" "}
                      <span className="tabular-nums text-xs text-[var(--muted-foreground)]">
                        ×{b.count.toLocaleString()}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--muted-foreground)]" colSpan={10}>
                      Automated — excluded from all stats.
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

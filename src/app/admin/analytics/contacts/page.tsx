import { listContacts } from "@/features/admin/data/analytics";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { AssessmentScopeBar } from "@/features/admin/components/assessment-scope-bar";
import { ContactsTable } from "@/features/admin/components/contacts-table";
import { getAssessmentForAnalytics } from "@/features/assessment/data";
import { getStatsFloor } from "@/lib/stats-floor";
import { formatIST } from "@/lib/date";
import { actingTenantId } from "@/lib/tenant/acting";

export const dynamic = "force-dynamic";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; from?: string; to?: string; assessment?: string }>;
}) {
  const sp = await searchParams;
  const requested = Math.max(1, Number(sp.page ?? "1") || 1);
  const t = await actingTenantId();
  const scoped = sp.assessment ? await getAssessmentForAnalytics(sp.assessment, t) : null;
  // Load all (within the date range) so the live search box can match across every
  // contact, not just one page. Pagination below collapses to a single page.
  const pageSize = 100_000;
  const { rows, total, page, pages } = await listContacts({
    page: requested,
    pageSize,
    from: sp.from,
    to: sp.to,
    tenantId: t,
    ...(scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : {}),
  });

  // Pagination links must keep the active date range + assessment scope.
  const pageHref = (p: number) => {
    const params = new URLSearchParams();
    if (sp.from) params.set("from", sp.from);
    if (sp.to) params.set("to", sp.to);
    if (scoped) params.set("assessment", scoped.id);
    params.set("page", String(p));
    return `?${params.toString()}`;
  };
  // Effective reporting floor (Data window): the assessment's own when scoped, else the
  // global one (none while impersonating) — mirrors what listContacts actually applies.
  const effectiveFloor: Date | null = scoped ? scoped.statsResetAt : t ? null : await getStatsFloor();
  const rangeNote =
    sp.from || sp.to
      ? ` (${sp.from ?? "start"} → ${sp.to ?? "today"} IST)`
      : effectiveFloor
        ? ` · from ${formatIST(effectiveFloor.toISOString())} IST (Data window)`
        : "";

  const exportHref = (format: string) => {
    const p = new URLSearchParams();
    if (sp.from) p.set("from", sp.from);
    if (sp.to) p.set("to", sp.to);
    p.set("format", format);
    return `/api/admin/contacts/export?${p.toString()}`;
  };
  const exportGroups = [
    { items: [
      { label: "CSV", href: exportHref("csv") },
      { label: "JSON", href: exportHref("json") },
    ] },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Contacts</h1>
          <p className="text-sm text-[var(--muted-foreground)]">
            {total.toLocaleString()} opt-ins{rangeNote}. Ticks = opted in · completed · VSL loaded (result shown).
          </p>
        </div>
        {scoped ? null : <AnalyticsToolbar exportGroups={exportGroups} />}
      </div>

      {scoped ? (
        <AssessmentScopeBar assessmentTitle={scoped.title} allHref="/admin/analytics/contacts" />
      ) : null}

      <DateRangeFilter
        basePath="/admin/analytics/contacts"
        from={sp.from}
        to={sp.to}
        extraQuery={scoped ? { assessment: scoped.id } : undefined}
      />

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">
          {sp.from || sp.to ? "No contacts in this date range." : "No contacts yet."}
        </p>
      ) : (
        <ContactsTable rows={rows} />
      )}

      {pages > 1 ? (
        <div className="flex items-center gap-4 text-sm">
          {page > 1 ? <a className="underline" href={pageHref(page - 1)}>← Prev</a> : <span />}
          <span className="text-[var(--muted-foreground)]">Page {page} of {pages}</span>
          {page < pages ? <a className="underline" href={pageHref(page + 1)}>Next →</a> : null}
        </div>
      ) : null}
    </div>
  );
}

import { listGateQualified, submissionsForGateLeads, getAssessmentForAnalytics, listAssessments } from "@/features/assessment/data";
import { AssessmentPicker } from "@/features/admin/components/assessment-picker";
import { DateRangeFilter } from "@/features/admin/components/date-range-filter";
import { labeledAnswers } from "@/features/assessment/custom-fields";
import { type Scope } from "@/lib/tenant/scope";
import {
  GateQualifiedTable,
  type GateQualifiedRow,
  type GateAnswerRow,
} from "@/features/admin/components/gate-qualified-table";
import { SUBMISSIONS_WINDOW } from "@/features/admin/data/analytics";

/** Gate answers as stored on the row: resolved when they were answered, never rebuilt
 *  at render, so a result already given out cannot move when the gate is edited. */
function readGateAnswers(value: unknown): GateAnswerRow[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
    .map((r) => ({
      q: typeof r.q === "string" ? r.q : "",
      a: typeof r.a === "string" ? r.a : "",
      points: typeof r.points === "number" ? r.points : 0,
      max: typeof r.max === "number" ? r.max : 0,
    }))
    .filter((r) => r.q || r.a);
}

/**
 * The Gate qualified screen, shared by the console and the workspace.
 *
 * One component for both, unlike Submissions (which predates the workspace and has two
 * near-identical copies). The row mapping here decides what a lead IS, and two copies
 * of that rule would eventually answer differently.
 */
export async function GateQualifiedView({
  scope,
  basePath,
  searchParams,
}: {
  scope: Scope;
  /** "/admin/gate-qualified" or "/w/gate-qualified" - for the assessment picker links. */
  basePath: string;
  searchParams: { assessment?: string; from?: string; to?: string };
}) {
  const assessmentOptions = (await listAssessments(scope)).map((a) => ({ id: a.id, title: a.title }));
  // Scoped to one assessment, like Submissions: the gate answers differ per funnel, so
  // a mixed list would put unrelated questions in one column.
  const scopedId = searchParams.assessment ?? assessmentOptions[0]?.id;
  const scoped = scopedId ? await getAssessmentForAnalytics(scopedId, scope) : null;

  const leads = await listGateQualified(SUBMISSIONS_WINDOW, scope, {
    ...(scoped ? { assessmentId: scoped.id, floor: scoped.statsResetAt } : {}),
    from: scoped ? undefined : searchParams.from,
    to: searchParams.to,
  });

  const submissions = await submissionsForGateLeads(
    leads.map((l) => l.submissionId).filter((id): id is string => !!id),
  );

  const rows: GateQualifiedRow[] = leads.map((l) => {
    const sub = l.submissionId ? submissions.get(l.submissionId) ?? null : null;
    const extras = labeledAnswers({
      optinFields: l.assessment.optinFields,
      optinAnswers: l.optinAnswers,
      preResultFields: null,
      preResultAnswers: null,
    });
    return {
      id: l.id,
      customerId: l.customerId,
      name: [l.leadFirstName, l.leadLastName].filter(Boolean).join(" ").trim(),
      email: l.leadEmail ?? "",
      role: l.audienceRole ?? l.leadProfession,
      capturedAt: l.emailCapturedAt ? l.emailCapturedAt.toISOString() : null,
      gateScore: l.gateScore,
      gateMax: l.gateMax,
      gateBand: l.gateBand,
      gateAnswers: readGateAnswers(l.gateBreakdown),
      extras: extras.map((e) => ({ label: e.label, value: e.value })),
      assessmentTitle: l.assessment.title,
      submissionId: l.submissionId,
      completedAt: sub?.completedAt ? sub.completedAt.toISOString() : null,
      score:
        sub && sub.totalScore !== null && sub.maxScore !== null
          ? `${Math.round(sub.totalScore)}/${Math.round(sub.maxScore)}`
          : null,
      bandTitle: sub?.bandTitle ?? null,
      place: [l.city, l.country].filter(Boolean).join(", ") || null,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Gate qualified</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          People who cleared the qualification gate and gave an email, on funnels using split
          lead capture. They appear here the moment the email is submitted, which is long before
          the assessment is finished.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <AssessmentPicker
          assessments={assessmentOptions}
          selectedId={scoped?.id ?? null}
          basePath={basePath}
          allowAll={false}
        />
        {scoped ? null : <DateRangeFilter basePath={basePath} />}
      </div>

      <GateQualifiedTable rows={rows} />
    </div>
  );
}

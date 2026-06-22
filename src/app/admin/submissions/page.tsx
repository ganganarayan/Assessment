import Link from "next/link";
import { listSubmissions } from "@/features/assessment/data";
import { AnalyticsToolbar } from "@/features/admin/components/analytics-toolbar";
import { formatIST } from "@/lib/date";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const EXPORT_GROUPS = [
  {
    items: [
      { label: "CSV", href: "/api/admin/submissions/export?format=csv" },
      { label: "JSON", href: "/api/admin/submissions/export?format=json" },
    ],
  },
];

export default async function SubmissionsPage() {
  const submissions = await listSubmissions();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-tight">Submissions</h1>
        <AnalyticsToolbar exportGroups={EXPORT_GROUPS} />
      </div>
      <p className="-mt-4 text-xs text-[var(--muted-foreground)]">
        Export includes every submission with its score, overall band, UTMs, category results, and
        all AI-message versions. The table below shows the latest 100.
      </p>

      {submissions.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Date (IST)</th>
                <th className="px-3 py-2">Assessment</th>
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">Result</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {submissions.map((s) => (
                <tr key={s.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{formatIST(s.createdAt)}</td>
                  <td className="px-3 py-2">{s.assessment.title}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col">
                      <span>
                        {[s.leadFirstName, s.leadLastName].filter(Boolean).join(" ") || "—"}
                      </span>
                      <span className="text-xs text-[var(--muted-foreground)]">
                        {s.leadEmail ?? ""} {s.leadMobile ? `· ${s.leadMobile}` : ""}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {s.totalScore != null ? `${s.totalScore} / ${s.maxScore ?? 0}` : "—"}
                  </td>
                  <td className="px-3 py-2">{s.resultBand?.title ?? "—"}</td>
                  <td className="px-3 py-2">
                    <Badge variant={s.status === "COMPLETED" ? "success" : "muted"}>
                      {s.status}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {s.status === "COMPLETED" ? (
                      <Link
                        href={`/a/${s.assessment.slug}/r/${s.id}`}
                        className="text-xs underline"
                      >
                        Result
                      </Link>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

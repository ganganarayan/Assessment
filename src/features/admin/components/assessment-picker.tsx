"use client";

import { useRouter } from "next/navigation";

/** Dropdown to scope a page to one assessment (or all). Navigates to
 *  `<basePath>?assessment=<id>` (plus any preserved params), which the server page
 *  reads to filter the data below. Reused on Submissions (admin + workspace) + Stats.
 *
 *  variant "heading" renders the select AS the page heading (large, chrome-less) so
 *  the assessment name isn't shown twice; "default" is a normal labelled control. */
export function AssessmentPicker({
  assessments,
  selectedId,
  basePath,
  label = "Assessment",
  variant = "default",
  preserveParams,
  allowAll = true,
}: {
  assessments: { id: string; title: string }[];
  selectedId: string | null;
  basePath: string;
  label?: string;
  variant?: "default" | "heading";
  /** Query params to keep across a change (e.g. { from, to } date range). */
  preserveParams?: Record<string, string | undefined>;
  /** Offer the "All assessments" choice. Off for Submissions, where a merged
   *  cross-assessment list isn't meaningful — one assessment is always scoped. */
  allowAll?: boolean;
}) {
  const router = useRouter();
  const go = (id: string) => {
    const p = new URLSearchParams();
    if (id) p.set("assessment", id);
    for (const [k, v] of Object.entries(preserveParams ?? {})) if (v) p.set(k, v);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  if (variant === "heading") {
    return (
      <select
        aria-label={label}
        value={selectedId ?? ""}
        onChange={(e) => go(e.target.value)}
        className="max-w-full cursor-pointer truncate border-0 bg-transparent p-0 text-2xl font-bold tracking-tight text-[var(--foreground)] focus:outline-none focus:ring-0"
      >
        {allowAll && <option value="">All assessments</option>}
        {assessments.map((a) => (
          <option key={a.id} value={a.id}>{a.title}</option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="assessment-picker" className="text-xs font-medium text-[var(--muted-foreground)]">
        {label}
      </label>
      <select
        id="assessment-picker"
        value={selectedId ?? ""}
        onChange={(e) => go(e.target.value)}
        className="h-10 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
      >
        {allowAll && <option value="">All assessments</option>}
        {assessments.map((a) => (
          <option key={a.id} value={a.id}>{a.title}</option>
        ))}
      </select>
    </div>
  );
}

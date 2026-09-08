"use client";

import { useRouter } from "next/navigation";

/** Dropdown to scope a page to one assessment (or all). Navigates to
 *  `<basePath>?assessment=<id>` (or `<basePath>` for all), which the server page
 *  reads to filter the data below. Reused on Submissions (admin + workspace). */
export function AssessmentPicker({
  assessments,
  selectedId,
  basePath,
  label = "Assessment",
}: {
  assessments: { id: string; title: string }[];
  selectedId: string | null;
  basePath: string;
  label?: string;
}) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor="assessment-picker" className="text-xs font-medium text-[var(--muted-foreground)]">
        {label}
      </label>
      <select
        id="assessment-picker"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = e.target.value;
          router.push(id ? `${basePath}?assessment=${encodeURIComponent(id)}` : basePath);
        }}
        className="h-10 w-full max-w-md rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
      >
        <option value="">All assessments</option>
        {assessments.map((a) => (
          <option key={a.id} value={a.id}>{a.title}</option>
        ))}
      </select>
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatIST } from "@/lib/date";
import { Badge } from "@/components/ui/badge";

export interface SubmissionRow {
  id: string;
  slug: string;
  assessmentTitle: string;
  createdAt: string; // ISO
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  totalScore: number | null;
  maxScore: number | null;
  bandTitle: string | null;
  status: string;
}

type SortKey = "date" | "lead" | "score" | "result" | "status";

/** Submissions grouped by assessment (name shown once as a section header), with
 *  click-to-sort columns (toggles asc/desc, applied within each group). */
export function SubmissionsTable({ rows }: { rows: SubmissionRow[] }) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  const groups = useMemo(() => {
    const name = (r: SubmissionRow) => [r.firstName, r.lastName].filter(Boolean).join(" ").toLowerCase();
    const val = (r: SubmissionRow): string | number => {
      switch (sort.key) {
        case "date": return r.createdAt;
        case "lead": return name(r);
        case "score": return r.totalScore ?? -1;
        case "result": return (r.bandTitle ?? "").toLowerCase();
        case "status": return r.status;
      }
    };
    const cmp = (a: SubmissionRow, b: SubmissionRow) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    };

    const m = new Map<string, SubmissionRow[]>();
    for (const r of rows) {
      const arr = m.get(r.assessmentTitle) ?? [];
      arr.push(r);
      m.set(r.assessmentTitle, arr);
    }
    for (const arr of m.values()) arr.sort(cmp);
    return Array.from(m.entries());
  }, [rows, sort]);

  const Th = ({ k, label, className = "" }: { k: SortKey; label: string; className?: string }) => (
    <th
      onClick={() => toggle(k)}
      className={`cursor-pointer select-none px-3 py-2 hover:text-[var(--foreground)] ${className}`}
    >
      {label}
      {arrow(k)}
    </th>
  );

  return (
    <div className="flex flex-col gap-6">
      {groups.map(([title, subs]) => (
        <div key={title} className="flex flex-col gap-2">
          <h2 className="text-lg font-semibold">
            {title}{" "}
            <span className="text-sm font-normal text-[var(--muted-foreground)]">({subs.length})</span>
          </h2>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <Th k="date" label="Date (IST)" className="whitespace-nowrap" />
                  <Th k="lead" label="Lead" />
                  <Th k="score" label="Score" />
                  <Th k="result" label="Result" />
                  <Th k="status" label="Status" />
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{formatIST(s.createdAt)}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span>{[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {s.email ?? ""} {s.mobile ? `· ${s.mobile}` : ""}
                        </span>
                        {s.profession ? (
                          <span className="text-xs text-[var(--muted-foreground)]">{s.profession}</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">
                      {s.totalScore != null ? `${s.totalScore} / ${s.maxScore ?? 0}` : "—"}
                    </td>
                    <td className="px-3 py-2">{s.bandTitle ?? "—"}</td>
                    <td className="px-3 py-2">
                      <Badge variant={s.status === "COMPLETED" ? "success" : "muted"}>{s.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      {s.status === "COMPLETED" ? (
                        <Link href={`/a/${s.slug}/r/${s.id}`} className="text-xs underline">
                          Result
                        </Link>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

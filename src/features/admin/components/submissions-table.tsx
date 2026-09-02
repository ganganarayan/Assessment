"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatIST } from "@/lib/date";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type PayloadAttribution } from "@/features/events/types";

export interface SubmissionRow {
  id: string;
  slug: string;
  assessmentId: string;
  assessmentTitle: string;
  createdAt: string; // ISO (opt-in)
  completedAt: string | null; // ISO
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  mobile: string | null;
  profession: string | null;
  customerId: string | null;
  totalScore: number | null;
  maxScore: number | null;
  bandTitle: string | null;
  status: string;
  /** Destination URL the contact lands on (targetUrl?t=token) — completed only. */
  resultUrl: string | null;
  paidAmount: number | null;
  paidAt: string | null;
  vslLoads: number;
  deviceType: string | null;
  browser: string | null;
  os: string | null;
  country: string | null;
  city: string | null;
  region: string | null;
  timezone: string | null;
  attribution: PayloadAttribution | null;
  fbclidTimestamp: number | null;
  fbp: string | null;
  clientIp: string | null;
  userAgent: string | null;
  customAnswers: { label: string; value: string }[];
}

type SortKey = "date" | "lead" | "score";

/** utm columns pulled from the attribution blob (same set as Contacts). */
const UTM = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const;

const dash = (v: string | null | undefined) => (v && String(v).trim() ? String(v) : "—");

/** Join non-empty parts with a separator; em-dash when all are blank. */
const join = (parts: (string | null)[], sep: string) => {
  const s = parts.filter((p) => p && p.trim()).join(sep);
  return s || "—";
};

/**
 * Submissions grouped by assessment (name shown once as a section header), with
 * click-to-sort columns (toggles asc/desc, applied within each group). This is the
 * superset view: it also carries every opt-in/tracking field the Contacts page shows.
 *  `exportBase`, when given, adds per-assessment "CSV" / "JSON" export links.
 */
export function SubmissionsTable({
  rows,
  exportBase,
}: {
  rows: SubmissionRow[];
  exportBase?: string;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [query, setQuery] = useState("");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const copy = (key: string, text: string) => {
    navigator.clipboard
      ?.writeText(text)
      .then(() => {
        setCopiedKey(key);
        setTimeout(() => setCopiedKey((c) => (c === key ? null : c)), 1500);
      })
      .catch(() => {});
  };

  const toggle = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === "asc" ? " ↑" : " ↓") : "");

  const groups = useMemo(() => {
    // Live substring search: any contiguous run of the typed letters, anywhere in
    // name / email / phone / profession / assessment / result (case-insensitive).
    const q = query.trim().toLowerCase();
    const matches = (r: SubmissionRow) =>
      !q ||
      [r.firstName, r.lastName, r.email, r.mobile, r.profession, r.assessmentTitle, r.bandTitle, r.customerId,
        ...r.customAnswers.map((a) => `${a.label} ${a.value}`)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q);
    const visible = rows.filter(matches);

    const name = (r: SubmissionRow) => [r.firstName, r.lastName].filter(Boolean).join(" ").toLowerCase();
    const val = (r: SubmissionRow): string | number => {
      switch (sort.key) {
        case "date": return r.createdAt;
        case "lead": return name(r);
        case "score": return r.totalScore ?? -1;
      }
    };
    const cmp = (a: SubmissionRow, b: SubmissionRow) => {
      const av = val(a);
      const bv = val(b);
      if (av < bv) return sort.dir === "asc" ? -1 : 1;
      if (av > bv) return sort.dir === "asc" ? 1 : -1;
      return 0;
    };

    const m = new Map<string, { title: string; rows: SubmissionRow[] }>();
    for (const r of visible) {
      const g = m.get(r.assessmentId) ?? { title: r.assessmentTitle, rows: [] };
      g.rows.push(r);
      m.set(r.assessmentId, g);
    }
    for (const g of m.values()) g.rows.sort(cmp);
    return Array.from(m.entries());
  }, [rows, sort, query]);

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
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, email, phone, profession, assessment…"
        className="max-w-md"
        aria-label="Search submissions"
      />
      {groups.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No submissions match “{query}”.</p>
      ) : null}
      {groups.map(([assessmentId, group]) => (
        <div key={assessmentId} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="text-lg font-semibold">
              {group.title}{" "}
              <span className="text-sm font-normal text-[var(--muted-foreground)]">
                ({group.rows.length})
              </span>
            </h2>
            {exportBase ? (
              <div className="flex items-center gap-3 text-xs">
                <span className="text-[var(--muted-foreground)]">Export:</span>
                <a href={`${exportBase}?assessment=${assessmentId}&format=csv`} className="underline">CSV</a>
                <a href={`${exportBase}?assessment=${assessmentId}&format=json`} className="underline">JSON</a>
              </div>
            ) : null}
          </div>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
                <tr>
                  <Th k="lead" label="Contact" />
                  <Th k="score" label="Score" />
                  <th className="px-3 py-2">Result URL</th>
                  <th
                    onClick={() => toggle("date")}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2 hover:text-[var(--foreground)]"
                  >
                    <div>Opt-in (IST){arrow("date")}</div>
                    <div className="opacity-70">Completion</div>
                  </th>
                  <th className="whitespace-nowrap px-3 py-2">
                    <div>Completed</div>
                    <div className="opacity-70">Paid</div>
                  </th>
                  <th className="px-3 py-2 text-center">VSL</th>
                  <th className="px-3 py-2">Result</th>
                  <th className="px-3 py-2">PDF</th>
                  <th className="px-3 py-2">Device</th>
                  {UTM.map((u) => (
                    <th key={u} className="whitespace-nowrap px-3 py-2">{u}</th>
                  ))}
                  <th className="whitespace-nowrap px-3 py-2">client_ip</th>
                  <th className="whitespace-nowrap px-3 py-2">user_agent</th>
                  <th className="whitespace-nowrap px-3 py-2">Location</th>
                  <th className="whitespace-nowrap px-3 py-2">timezone</th>
                  <th className="whitespace-nowrap px-3 py-2">fbp</th>
                  <th className="whitespace-nowrap px-3 py-2">fbclid_timestamp</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {group.rows.map((s) => (
                  <tr key={s.id}>
                    {/* Contact */}
                    <td className="px-3 py-2">
                      <div className="flex flex-col">
                        <span className="font-medium">{[s.firstName, s.lastName].filter(Boolean).join(" ") || "—"}</span>
                        <span className="text-xs text-[var(--muted-foreground)]">
                          {s.email ?? ""}{s.mobile ? ` · ${s.mobile}` : ""}
                        </span>
                        {s.profession ? (
                          <span className="text-xs text-[var(--muted-foreground)]">{s.profession}</span>
                        ) : null}
                        {s.customAnswers.map((a) => (
                          <span key={a.label} className="text-xs text-[var(--muted-foreground)]">
                            <span className="font-medium">{a.label}:</span> {a.value}
                          </span>
                        ))}
                        {s.customerId ? (
                          <span className="font-mono text-[10px] text-[var(--muted-foreground)]">{s.customerId}</span>
                        ) : null}
                      </div>
                    </td>
                    {/* Score + band */}
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-col">
                        <span className="tabular-nums">
                          {s.totalScore != null ? `${s.totalScore} / ${s.maxScore ?? 0}` : "—"}
                        </span>
                        {s.bandTitle ? (
                          <span className="text-xs text-[var(--muted-foreground)]">{s.bandTitle}</span>
                        ) : null}
                      </div>
                    </td>
                    {/* Result URL */}
                    <td className="px-3 py-2 align-top">
                      {s.resultUrl ? (
                        <div className="flex w-[200px] items-start gap-2">
                          <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-snug" title={s.resultUrl}>
                            {s.resultUrl}
                          </span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 shrink-0 px-2"
                            onClick={() => copy(`${s.id}:result`, s.resultUrl as string)}
                          >
                            {copiedKey === `${s.id}:result` ? "Copied" : "Copy"}
                          </Button>
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Opt-in / Completion times */}
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                      <div>{formatIST(s.createdAt)}</div>
                      <div className="opacity-70">{s.completedAt ? formatIST(s.completedAt) : "—"}</div>
                    </td>
                    {/* Completed tick / Paid */}
                    <td className="whitespace-nowrap px-3 py-2">
                      <div className="flex flex-col">
                        <span className={s.status === "COMPLETED" ? "text-green-600" : "text-[var(--muted-foreground)]"}>
                          {s.status === "COMPLETED" ? "✓" : "—"}
                        </span>
                        <span className="text-xs">
                          {s.paidAmount != null ? (
                            <span className="font-medium text-green-600 tabular-nums">₹{s.paidAmount}</span>
                          ) : (
                            <span className="text-[var(--muted-foreground)]">—</span>
                          )}
                        </span>
                      </div>
                    </td>
                    {/* VSL */}
                    <td className="px-3 py-2 text-center tabular-nums">{s.vslLoads}</td>
                    {/* Result link */}
                    <td className="px-3 py-2">
                      {s.status === "COMPLETED" ? (
                        <Link href={`/a/${s.slug}/r/${s.id}`} target="_blank" rel="noreferrer" className="text-xs underline">
                          Result
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* PDF link */}
                    <td className="px-3 py-2">
                      {s.status === "COMPLETED" ? (
                        <a href={`/api/reports/${s.id}`} target="_blank" rel="noreferrer" className="text-xs underline">
                          PDF
                        </a>
                      ) : (
                        "—"
                      )}
                    </td>
                    {/* Device */}
                    <td className="whitespace-nowrap px-3 py-2 text-xs">
                      {join([s.deviceType, s.browser, s.os], " · ")}
                    </td>
                    {/* UTM — fbclid truncates to 1 line + Copy; utm_content wraps (clamped). */}
                    {UTM.map((u) => {
                      const v = s.attribution?.[u] ?? null;
                      if (u === "fbclid") {
                        return (
                          <td key={u} className="px-3 py-2 text-xs">
                            {v ? (
                              <div className="flex items-center gap-1">
                                <span className="max-w-[90px] truncate font-mono text-[11px]" title={v}>{v}</span>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 shrink-0 px-1.5 text-[10px]"
                                  onClick={() => copy(`${s.id}:fbclid`, v)}
                                >
                                  {copiedKey === `${s.id}:fbclid` ? "✓" : "Copy"}
                                </Button>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>
                        );
                      }
                      if (u === "utm_content") {
                        return (
                          <td key={u} className="px-3 py-2 text-xs">
                            <div className="max-w-[180px] break-words line-clamp-4" title={v ?? ""}>{dash(v)}</div>
                          </td>
                        );
                      }
                      return (
                        <td key={u} className="whitespace-nowrap px-3 py-2 text-xs">
                          {dash(v)}
                        </td>
                      );
                    })}
                    {/* Other tracking */}
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{dash(s.clientIp)}</td>
                    <td className="px-3 py-2 text-xs">
                      <div className="max-w-[220px] break-words line-clamp-4" title={s.userAgent ?? ""}>{dash(s.userAgent)}</div>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{join([s.city, s.region, s.country], ", ")}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs">{dash(s.timezone)}</td>
                    <td className="max-w-[160px] truncate px-3 py-2 text-xs" title={s.fbp ?? ""}>{dash(s.fbp)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{s.fbclidTimestamp ?? "—"}</td>
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

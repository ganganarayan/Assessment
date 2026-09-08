"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "./date-picker";
import { setAssessmentStatsWindow } from "@/features/admin/actions/stats-window";

/**
 * From/To date range filter (IST, DD-MM-YYYY).
 *
 * Two modes:
 *  - Default (unscoped / no sticky id): From + To live in the URL and auto-apply as
 *    soon as a field is a complete date (or cleared). An explicit "Apply" is kept.
 *  - Sticky-start (an assessment is scoped): the FROM date is the assessment's OWN
 *    saved reporting start (Assessment.statsResetAt / "Data window") — a DB entry that
 *    sticks PER ASSESSMENT and does NOT carry across assessments. Changing From saves it
 *    (server action) and refreshes; To stays an optional URL-only end date.
 *
 * extraQuery (e.g. { assessment }) is preserved; "Clear" returns to basePath.
 */
const DMY = /^\d{2}-\d{2}-\d{4}$/;

/** "DD-MM-YYYY" -> IST-local "YYYY-MM-DDT00:00" for setAssessmentStatsWindow. */
function ddmmyyyyToIstLocal(v: string): string {
  const [dd, mm, yy] = v.split("-");
  return `${yy}-${mm}-${dd}T00:00`;
}

export function DateRangeFilter({
  basePath,
  from,
  to,
  extraQuery,
  stickyStartAssessmentId,
  stickyStartValue,
}: {
  basePath: string;
  from?: string;
  to?: string;
  /** Extra query params preserved across apply/clear (e.g. { assessment: id }). */
  extraQuery?: Record<string, string>;
  /** When set, From is the per-assessment saved reporting start (DB), not a URL param. */
  stickyStartAssessmentId?: string;
  /** The saved start as DD-MM-YYYY (from the assessment's statsResetAt); "" if none. */
  stickyStartValue?: string;
}) {
  const router = useRouter();
  const sticky = Boolean(stickyStartAssessmentId);
  const [f, setF] = useState(sticky ? (stickyStartValue ?? "") : (from ?? ""));
  const [t, setT] = useState(to ?? "");
  const [pending, start] = useTransition();
  // Keep the fields in sync with the source of truth. In sticky mode From follows the
  // saved value (so switching assessments shows THAT assessment's date, never a stale
  // one); otherwise both follow the URL.
  useEffect(() => { setF(sticky ? (stickyStartValue ?? "") : (from ?? "")); }, [sticky, stickyStartValue, from]);
  useEffect(() => { setT(to ?? ""); }, [to]);
  const active = Boolean(f || t);
  const extras = Object.entries(extraQuery ?? {});
  const clearHref = extras.length
    ? `${basePath}?${new URLSearchParams(extraQuery).toString()}`
    : basePath;

  // --- URL navigation (To in sticky mode; both in default mode) ---
  const apply = (nf: string, nt: string) => {
    const p = new URLSearchParams(extraQuery ?? {});
    if (nf) p.set("from", nf);
    if (nt) p.set("to", nt);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };
  const commit = (nf: string, nt: string) => {
    const fOk = nf === "" || DMY.test(nf);
    const tOk = nt === "" || DMY.test(nt);
    if (fOk && tOk) apply(nf, nt);
  };
  // Sticky mode: push ONLY the To (start is saved in the DB, not the URL).
  const pushTo = (nt: string) => {
    const p = new URLSearchParams(extraQuery ?? {});
    if (nt) p.set("to", nt);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };

  // --- Sticky-start persistence (per-assessment saved reporting start) ---
  const saveStart = (v: string) => {
    if (!stickyStartAssessmentId) return;
    start(async () => {
      await setAssessmentStatsWindow(stickyStartAssessmentId, v ? ddmmyyyyToIstLocal(v) : null);
      router.refresh();
    });
  };

  const onFromChange = (v: string) => {
    setF(v);
    if (sticky) {
      if (v === "" || DMY.test(v)) saveStart(v);
    } else {
      commit(v, t);
    }
  };
  const onToChange = (v: string) => {
    setT(v);
    if (sticky) {
      if (v === "" || DMY.test(v)) pushTo(v);
    } else {
      commit(f, v);
    }
  };
  const onApply = () => {
    if (sticky) {
      saveStart(f);
      pushTo(t);
    } else {
      apply(f, t);
    }
  };
  const onClear = () => {
    if (sticky) {
      start(async () => {
        if (stickyStartAssessmentId) await setAssessmentStatsWindow(stickyStartAssessmentId, null);
        router.push(clearHref);
      });
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-end gap-3">
        <DatePicker
          name="from"
          label={sticky ? "From (IST) — saved for this assessment" : "From (IST)"}
          value={f}
          onChange={onFromChange}
        />
        <DatePicker name="to" label="To (IST) — optional" value={t} onChange={onToChange} />
        <Button type="button" size="sm" onClick={onApply} disabled={pending}>
          Apply
        </Button>
        {active ? (
          sticky ? (
            <button
              type="button"
              onClick={onClear}
              disabled={pending}
              className="pb-2.5 text-sm text-[var(--muted-foreground)] underline"
            >
              Clear
            </button>
          ) : (
            <Link href={clearHref} className="pb-2.5 text-sm text-[var(--muted-foreground)] underline">
              Clear
            </Link>
          )
        ) : null}
      </div>
      {sticky ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          This start date is saved for this assessment and won&apos;t change when you switch to another.
        </p>
      ) : null}
    </div>
  );
}

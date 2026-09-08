"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { DatePicker } from "./date-picker";

/**
 * From/To date range filter (IST, DD-MM-YYYY). AUTO-APPLIES: as soon as a field
 * becomes a complete date (calendar pick or a full typed date) — or is cleared —
 * it navigates, so the range sticks in the URL (carried across an assessment
 * change) without needing the button. An explicit "Apply" is also kept. `to` is
 * optional (open-ended start). extraQuery (e.g. { assessment }) is preserved;
 * "Clear" returns to basePath.
 */
const DMY = /^\d{2}-\d{2}-\d{4}$/;

export function DateRangeFilter({
  basePath,
  from,
  to,
  extraQuery,
}: {
  basePath: string;
  from?: string;
  to?: string;
  /** Extra query params preserved across apply/clear (e.g. { assessment: id }). */
  extraQuery?: Record<string, string>;
}) {
  const router = useRouter();
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const active = Boolean(from || to);
  const extras = Object.entries(extraQuery ?? {});
  const clearHref = extras.length
    ? `${basePath}?${new URLSearchParams(extraQuery).toString()}`
    : basePath;

  const apply = (nf: string, nt: string) => {
    const p = new URLSearchParams(extraQuery ?? {});
    if (nf) p.set("from", nf);
    if (nt) p.set("to", nt);
    const qs = p.toString();
    router.push(qs ? `${basePath}?${qs}` : basePath);
  };
  // Navigate only when both fields are a complete date or empty — so typing a
  // partial date doesn't fire mid-keystroke; a calendar pick fires immediately.
  const commit = (nf: string, nt: string) => {
    const fOk = nf === "" || DMY.test(nf);
    const tOk = nt === "" || DMY.test(nt);
    if (fOk && tOk) apply(nf, nt);
  };

  return (
    <div className="flex flex-wrap items-end gap-3">
      <DatePicker name="from" label="From (IST)" value={f} onChange={(v) => { setF(v); commit(v, t); }} />
      <DatePicker name="to" label="To (IST) — optional" value={t} onChange={(v) => { setT(v); commit(f, v); }} />
      <Button type="button" size="sm" onClick={() => apply(f, t)}>
        Apply
      </Button>
      {active ? (
        <Link
          href={clearHref}
          className="pb-2.5 text-sm text-[var(--muted-foreground)] underline"
        >
          Clear
        </Link>
      ) : null}
    </div>
  );
}

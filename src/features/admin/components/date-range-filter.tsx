"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { DatePicker } from "./date-picker";

/**
 * From/To date range filter (IST). A plain GET form so it still works without
 * client navigation — submitting reloads with ?from=&to=. Each field can be
 * typed directly OR picked from a calendar (see DatePicker). Same date in both
 * = a single day. "Clear" returns to the unfiltered view (basePath).
 */
export function DateRangeFilter({
  basePath,
  from,
  to,
  extraQuery,
}: {
  basePath: string;
  from?: string;
  to?: string;
  /** Extra query params preserved across Apply/Clear (e.g. { assessment: id }). */
  extraQuery?: Record<string, string>;
}) {
  const [f, setF] = useState(from ?? "");
  const [t, setT] = useState(to ?? "");
  const active = Boolean(from || to);
  const extras = Object.entries(extraQuery ?? {});
  const clearHref = extras.length
    ? `${basePath}?${new URLSearchParams(extraQuery).toString()}`
    : basePath;

  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
      {extras.map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <DatePicker name="from" label="From (IST)" value={f} onChange={setF} />
      <DatePicker name="to" label="To (IST)" value={t} onChange={setT} />
      <Button type="submit" size="sm">
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
    </form>
  );
}

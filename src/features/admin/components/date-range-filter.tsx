import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * From/To date range filter (IST). Plain GET form so it works in a Server
 * Component — submitting reloads the page with ?from=&to=. Same date in both =
 * a single day. "Clear" returns to the unfiltered view (basePath).
 */
export function DateRangeFilter({
  basePath,
  from,
  to,
}: {
  basePath: string;
  from?: string;
  to?: string;
}) {
  const active = Boolean(from || to);
  return (
    <form method="get" action={basePath} className="flex flex-wrap items-end gap-3">
      <div className="flex flex-col gap-1">
        <label htmlFor="from" className="text-xs text-[var(--muted-foreground)]">
          From (IST)
        </label>
        <Input id="from" type="date" name="from" defaultValue={from ?? ""} className="w-[160px]" />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="to" className="text-xs text-[var(--muted-foreground)]">
          To (IST)
        </label>
        <Input id="to" type="date" name="to" defaultValue={to ?? ""} className="w-[160px]" />
      </div>
      <Button type="submit" size="sm">
        Apply
      </Button>
      {active ? (
        <Link
          href={basePath}
          className="pb-2.5 text-sm text-[var(--muted-foreground)] underline"
        >
          Clear
        </Link>
      ) : null}
    </form>
  );
}

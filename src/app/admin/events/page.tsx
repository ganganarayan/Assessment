import Link from "next/link";
import { EventType } from "@prisma/client";
import { listEventLogs, eventCountsByType } from "@/features/events/data";
import { ALL_EVENT_TYPES, EVENT_NAME } from "@/features/events/types";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

function fmt(d: Date) {
  return new Date(d).toISOString().slice(0, 16).replace("T", " ");
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const type =
    sp.type && (ALL_EVENT_TYPES as string[]).includes(sp.type)
      ? (sp.type as EventType)
      : undefined;
  const page = Math.max(1, Number(sp.page ?? "1") || 1);

  const [{ rows, total }, counts] = await Promise.all([
    listEventLogs({ type, page, pageSize: PAGE_SIZE }),
    eventCountsByType(),
  ]);
  const totalAll = Array.from(counts.values()).reduce((a, b) => a + b, 0);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const link = (p: number) =>
    `/admin/events?${new URLSearchParams({
      ...(type ? { type } : {}),
      page: String(p),
    }).toString()}`;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Events</h1>
        <span className="text-sm text-[var(--muted-foreground)]">
          {totalAll} total
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/events"
          className={buttonVariants({ variant: type ? "outline" : "default", size: "sm" })}
        >
          All ({totalAll})
        </Link>
        {ALL_EVENT_TYPES.map((t) => (
          <Link
            key={t}
            href={`/admin/events?type=${t}`}
            className={buttonVariants({
              variant: type === t ? "default" : "outline",
              size: "sm",
            })}
          >
            {EVENT_NAME[t]} ({counts.get(t) ?? 0})
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">No events yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Event</th>
                <th className="px-3 py-2">Submission</th>
                <th className="px-3 py-2">Lead</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(e.createdAt)}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.name}</td>
                  <td className="px-3 py-2 font-mono text-xs">{e.submissionId ?? "—"}</td>
                  <td className="px-3 py-2">{e.leadEmail ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-sm">
        <span className="text-[var(--muted-foreground)]">
          Page {page} of {pages}
        </span>
        <div className="flex gap-2">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Previous
            </Link>
          ) : null}
          {page < pages ? (
            <Link href={link(page + 1)} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Next
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

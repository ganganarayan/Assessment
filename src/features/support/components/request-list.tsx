import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { type RequestRow } from "@/features/support/data";
import { formatIST } from "@/lib/date";
import { isClosedStatus, STATUS_LABEL, supportRef, TENANT_STATUS_LABEL } from "@/lib/support/model";

/**
 * The queue, for either side.
 *
 * One component, because two lists of the same rows drift: the day they disagree is the
 * day a tenant reads "you have a reply" on one screen and an empty thread on the other.
 * `side` changes the status wording and whether the workspace name is shown, and nothing
 * else.
 *
 * Open threads first, then the finished ones, both newest first. A support queue sorted
 * purely by date buries the thing somebody is waiting on under last month's resolved
 * questions.
 */
export function RequestList({
  rows,
  basePath,
  side,
}: {
  rows: RequestRow[];
  basePath: string;
  side: "tenant" | "platform";
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        Nothing here yet.
      </p>
    );
  }

  const open = rows.filter((r) => !isClosedStatus(r.status));
  const closed = rows.filter((r) => isClosedStatus(r.status));

  return (
    <div className="flex flex-col gap-6">
      <Group title="Open" rows={open} basePath={basePath} side={side} empty="Nothing open." />
      {closed.length > 0 ? (
        <Group title="Finished" rows={closed} basePath={basePath} side={side} empty="" />
      ) : null}
    </div>
  );
}

function Group({
  title,
  rows,
  basePath,
  side,
  empty,
}: {
  title: string;
  rows: RequestRow[];
  basePath: string;
  side: "tenant" | "platform";
  empty: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">{title}</p>
      {rows.length === 0 ? (
        empty ? <p className="text-sm text-[var(--muted-foreground)]">{empty}</p> : null
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.id}>
              <Link
                href={`${basePath}/${r.id}`}
                className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-[var(--muted)]"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-[var(--muted-foreground)]">
                    {supportRef(r.kind, r.number)}
                  </span>
                  {/* Red, and only when the other side spoke last. A badge that is
                      always lit is a badge nobody reads. */}
                  {r.unread ? (
                    <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white">
                      {side === "tenant" ? "Reply" : "New"}
                    </span>
                  ) : null}
                  <Badge variant={isClosedStatus(r.status) ? "muted" : "outline"}>
                    {side === "tenant" ? TENANT_STATUS_LABEL[r.status] : STATUS_LABEL[r.status]}
                  </Badge>
                </div>
                <p className="text-sm font-medium">{r.subject}</p>
                <p className="text-xs text-[var(--muted-foreground)]">
                  {side === "platform" ? `${r.tenantName} · ` : ""}
                  {r.topic} · {r.messageCount} message{r.messageCount === 1 ? "" : "s"} · last activity{" "}
                  {formatIST(new Date(r.updatedAt))}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

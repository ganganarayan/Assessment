"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createBroadcast } from "@/features/broadcasts/actions";
import { STATUS_CLASS, STATUS_LABEL, type BroadcastListRow } from "@/features/broadcasts/types";

/** The list, and where a new broadcast starts. */
export function BroadcastList({
  rows,
  basePath,
  wabaAvailable,
}: {
  rows: BroadcastListRow[];
  basePath: string;
  /** False hides WhatsApp as a choice: a channel that cannot send is not a choice. */
  wabaAvailable: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"EMAIL" | "WABA">("EMAIL");
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3 rounded-lg border p-4">
        <p className="text-sm font-medium">New broadcast</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={name} placeholder="What it is, e.g. October offer" onChange={(e) => setName(e.target.value)} />
          <select
            value={channel}
            onChange={(e) => setChannel(e.target.value as "EMAIL" | "WABA")}
            className="rounded-md border border-[var(--field-border)] bg-[var(--field-bg)] px-2 py-1 text-sm"
          >
            <option value="EMAIL">Email</option>
            {wabaAvailable ? <option value="WABA">WhatsApp</option> : null}
          </select>
          <Button
            size="sm"
            disabled={pending || !name.trim()}
            onClick={() =>
              start(async () => {
                setMsg(null);
                const r = await createBroadcast({ name, channel });
                if (!r.ok) setMsg(r.error);
                else if (r.data) router.push(`${basePath}/${r.data.id}`);
              })
            }
          >
            {pending ? "Creating..." : "Create"}
          </Button>
        </div>
        <p className="text-xs text-[var(--muted-foreground)]">
          The channel cannot be changed afterwards, because the message is written for it.
        </p>
        {msg ? <p className="text-sm text-red-500">{msg}</p> : null}
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-[var(--muted-foreground)]">
          No broadcasts yet.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {rows.map((b) => (
            <Link
              key={b.id}
              href={`${basePath}/${b.id}`}
              className="flex flex-col gap-1 rounded-lg border p-3 hover:bg-[var(--muted)]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="truncate text-sm font-medium">{b.name}</span>
                <span className={`rounded-full border px-2 py-0.5 text-xs ${STATUS_CLASS[b.status]}`}>
                  {STATUS_LABEL[b.status]}
                </span>
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                {b.channel === "WABA" ? "WhatsApp" : "Email"}
                {b.totalCount > 0 ? ` · ${b.sentCount} of ${b.totalCount} sent` : ""}
                {b.scheduledAt ? ` · goes ${b.scheduledAt} IST` : ""} · created {b.createdAt} IST
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

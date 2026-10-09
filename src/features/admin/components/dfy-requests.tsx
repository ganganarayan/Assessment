"use client";

import { useState, useTransition } from "react";
import { setDfyRequestStatus } from "@/features/admin/actions/dfy-requests";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type DfyRow = {
  id: string;
  business: string;
  email: string;
  whatsapp: string;
  website: string | null;
  sells: string;
  pricePoint: string;
  trafficSource: string;
  monthlyLeads: string;
  badLead: string;
  calendarLink: string | null;
  adAccountAccess: boolean;
  status: string;
  notifiedAt: string | null;
  createdAt: string;
};

const NEXT: Record<string, string[]> = {
  NEW: ["CONTACTED", "DECLINED"],
  CONTACTED: ["BUILT", "DECLINED"],
  BUILT: ["CONTACTED"],
  DECLINED: ["NEW"],
};

/**
 * The done-for-you queue.
 *
 * These rows existed before this screen did: an application was stored and emailed, and
 * then visible nowhere in the app at all. An alert in an inbox is not a queue - it has
 * no state, no "who has been contacted", and no way to tell a dropped one from a done
 * one. This is the list the twenty installs are actually worked from.
 *
 * 🔴 A row whose owner alert never sent is marked. That is the failure the write path
 * deliberately tolerates - the application is stored first and notified second, so a mail
 * outage costs an alert rather than an applicant - but the cost of that choice is a row
 * nobody was told about, and the only thing that makes it a safe trade is that it is
 * findable here.
 */
export function DfyRequests({ rows }: { rows: DfyRow[] }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [, start] = useTransition();

  if (rows.length === 0) {
    return (
      <p className="text-sm text-[var(--muted-foreground)]">
        No build requests yet. They arrive here the moment somebody submits the /build form,
        whether or not the email alert reached you.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {rows.map((r) => (
        <div key={r.id} className="rounded-lg border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium">{r.business}</p>
                <Badge variant={r.status === "BUILT" ? "success" : "muted"}>{r.status}</Badge>
                {r.adAccountAccess ? <Badge variant="outline">Ad account access</Badge> : null}
                {!r.notifiedAt ? (
                  <Badge variant="outline">Alert never sent</Badge>
                ) : null}
              </div>
              <p className="mt-1 text-sm text-[var(--muted-foreground)]">
                {r.sells} · {r.pricePoint} · {r.trafficSource} · {r.monthlyLeads}
              </p>
              <p className="mt-1 text-xs text-[var(--muted-foreground)]">
                {r.email} · {r.whatsapp}
                {r.website ? ` · ${r.website}` : ""} ·{" "}
                {new Date(r.createdAt).toLocaleDateString("en-GB")}
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(open === r.id ? null : r.id)}>
                {open === r.id ? "Close" : "Open"}
              </Button>
              {(NEXT[r.status] ?? []).map((next) => (
                <Button
                  key={next}
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => {
                    setBusy(r.id);
                    start(async () => {
                      await setDfyRequestStatus(r.id, next);
                      setBusy(null);
                    });
                  }}
                >
                  {next === "CONTACTED" ? "Mark contacted" : next === "BUILT" ? "Mark built" : next}
                </Button>
              ))}
            </div>
          </div>

          {open === r.id ? (
            <div className="mt-4 border-t pt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                Who is a bad lead for them
              </p>
              {/* The gate gets written from this answer, so it is given room rather than
                  truncated into the summary line with everything else. */}
              <p className="mt-2 whitespace-pre-wrap leading-relaxed">{r.badLead}</p>
              {r.calendarLink ? (
                <p className="mt-3 text-sm text-[var(--muted-foreground)]">
                  Calendar: {r.calendarLink}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

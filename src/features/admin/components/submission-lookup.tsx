"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { lookupSubmissionRef } from "@/features/admin/actions/lookup";
import { type LookupHit } from "@/features/admin/lookup-types";

/**
 * Cross-assessment viewer trace: paste a VidaPulse-captured result token (or a
 * customer id) and jump straight to the lead, ignoring the assessment dropdown and
 * the date window that otherwise scope the Submissions table. Read-only.
 */
export function SubmissionLookup({ basePath }: { basePath: string }) {
  const [value, setValue] = useState("");
  const [hit, setHit] = useState<LookupHit | null>(null);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const run = () =>
    start(async () => {
      setError(null);
      setSearched(false);
      const r = await lookupSubmissionRef(value);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setHit(r.hit);
      setSearched(true);
    });

  const name = hit ? [hit.firstName, hit.lastName].filter(Boolean).join(" ") || "—" : "";

  return (
    <div className="rounded-lg border border-[var(--border)] p-3">
      <label className="text-xs font-medium">Trace a viewer — paste a result token or customer ID</label>
      <div className="mt-1 flex gap-2">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") run();
          }}
          placeholder="e.g. M7ZGMQHCWNAZVP2S or L6G8P7B9"
          className="font-mono text-xs"
        />
        <Button size="sm" onClick={run} disabled={pending || !value.trim()}>
          {pending ? "Finding…" : "Find"}
        </Button>
      </div>
      <p className="mt-1 text-xs text-[var(--muted-foreground)]">
        Searches every assessment and date in this workspace — so the token VidaPulse captured resolves here.
      </p>

      {error ? <p className="mt-2 text-sm text-red-500">{error}</p> : null}

      {searched && !hit ? (
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          No lead found for that token / customer ID in this workspace.
        </p>
      ) : null}

      {hit ? (
        <div className="mt-3 flex flex-col gap-1 rounded-md border border-[var(--border)] bg-[var(--background)] p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-semibold">{name}</span>
            <span className="text-xs text-[var(--muted-foreground)]">
              {hit.status}
              {hit.completedAt ? ` · completed ${new Date(hit.completedAt).toLocaleString()}` : ""}
            </span>
          </div>
          <div className="text-xs text-[var(--muted-foreground)]">
            {[hit.email, hit.mobile, hit.profession].filter(Boolean).join(" · ") || "—"}
          </div>
          <div className="text-xs">
            <span className="text-[var(--muted-foreground)]">Assessment: </span>
            {hit.assessmentTitle}
          </div>
          <div className="font-mono text-[11px] text-[var(--muted-foreground)]">
            cid {hit.customerId ?? "—"} · token {hit.resultToken ?? "—"}
          </div>
          <div className="mt-1 flex gap-3">
            <Link href={`/a/${hit.slug}/r/${hit.submissionId}`} className="text-xs font-medium text-green-600 underline">
              Open result
            </Link>
            <Link href={`${basePath}?assessment=${hit.assessmentId}`} className="text-xs underline">
              View in Submissions
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}

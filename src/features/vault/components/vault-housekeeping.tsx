"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatIST } from "@/lib/date";
import {
  applyVaultOrphanPolicy,
  cleanVaultOrphans,
  vaultOrphanStatus,
} from "@/features/vault/actions";
import { ORPHAN_MAX_AGE_HOURS, type VaultOrphanStatus } from "@/features/vault/types";

/**
 * Storage housekeeping: the one cost nothing else in this app can see.
 *
 * 🔴 WHAT A STRANDED UPLOAD IS. A multipart upload that starts and never finishes
 * leaves its parts in R2. They are stored and billed, and they belong to no object - so
 * they appear in no file listing, not in this Vault and not in the Cloudflare browser.
 * Nothing reveals them except asking R2 for incomplete uploads by name, which is what
 * this panel does. They are created by any upload that dies after parts have gone up
 * but before the abort runs: a closed tab, a crashed page, a deploy restarting the app
 * mid upload. The browser's abort is best effort by nature, because the code that would
 * send it is the code that just stopped running.
 *
 * 🟢 WHAT ACTUALLY PREVENTS THEM. R2's own lifecycle rule, set once per bucket, which
 * aborts them server side with nothing in this app involved. The buttons here are for
 * the parts already stranded and for watching the number reach zero. The rule is the
 * guarantee; a browser that has to still be open is not one.
 *
 * It also sweeps once on mount - not because the rule needs help, but because a bucket
 * whose token cannot write lifecycle rules would otherwise have no automatic cleanup at
 * all, and opening the Vault is the one moment this app is certainly running.
 */
export function Housekeeping({ bucketId }: { bucketId: string }) {
  const [status, setStatus] = useState<VaultOrphanStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  // One automatic sweep per bucket. Without the ref a re-render would fire another
  // round of billed requests at R2 for nothing.
  const swept = useRef<string | null>(null);

  const load = useCallback(async () => {
    const r = await vaultOrphanStatus(bucketId);
    if (!r.ok) {
      setError(r.error);
      setStatus(null);
      return null;
    }
    setError(null);
    setStatus(r.data ?? null);
    return r.data ?? null;
  }, [bucketId]);

  useEffect(() => {
    if (swept.current === bucketId) return;
    swept.current = bucketId;
    void (async () => {
      const first = await load();
      // Only when something is old enough to take. Nothing young is ever touched, so an
      // upload running in another tab is safe from this.
      if (first && first.cleanable > 0) {
        const r = await cleanVaultOrphans(bucketId);
        if (r.ok && r.data && r.data.aborted > 0) {
          setNotice(
            `Cleaned up ${r.data.aborted} stranded upload(s) that never finished. They were costing storage and showed in no file list.`,
          );
          await load();
        }
      }
    })();
  }, [bucketId, load]);

  const cleanNow = () => {
    setBusy(true);
    setNotice(null);
    void (async () => {
      const r = await cleanVaultOrphans(bucketId);
      if (!r.ok) setError(r.error);
      else if (r.data) {
        const parts = [`Aborted ${r.data.aborted}`];
        if (r.data.skipped > 0) {
          parts.push(`left ${r.data.skipped} alone as younger than ${ORPHAN_MAX_AGE_HOURS} h`);
        }
        if (r.data.failed > 0) parts.push(`${r.data.failed} would not abort`);
        setNotice(`${parts.join(", ")}.`);
      }
      await load();
      setBusy(false);
    })();
  };

  const tighten = () => {
    setBusy(true);
    setNotice(null);
    void (async () => {
      const r = await applyVaultOrphanPolicy(bucketId);
      if (!r.ok) setError(r.error);
      else if (r.data) {
        setNotice(
          `R2 will now abort an unfinished upload ${r.data.days} day(s) after it starts, on its own, with nothing in this app involved.`,
        );
      }
      await load();
      setBusy(false);
    })();
  };

  const policyLine = !status
    ? null
    : status.policyError
      ? `🟡 Cannot read this bucket's cleanup rule: ${status.policyError}`
      : status.abortDays === null
        ? `🟡 No cleanup rule on this bucket, so R2's default of ${status.defaultDays} days applies. An unfinished upload is billed for ${status.defaultDays} days before R2 drops it.`
        : status.policyTight
          ? `🟢 R2 aborts unfinished uploads after ${status.abortDays} day(s), by its own rule. Nothing in this app has to be running.`
          : `🟡 This bucket's rule aborts unfinished uploads after ${status.abortDays} days. Tightening it to 1 day stops them being billed for a week.`;

  // Collapsed by default, with the count on the button: a number there is the only
  // reason to open it, and a zero should not pull attention.
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Storage housekeeping
        {status && status.rows.length > 0 ? (
          <span className="ml-2 text-xs opacity-70">{status.rows.length}</span>
        ) : null}
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border px-3 py-3">
      <div className="flex items-center gap-2">
        <span className="font-medium">Storage housekeeping</span>
        <Button size="sm" variant="ghost" onClick={() => void load()} disabled={busy}>
          Refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>

      <p className="text-xs text-muted-foreground">
        An upload that dies partway leaves its pieces in R2. They are billed as storage and appear
        in no file list, here or in Cloudflare, so this is the only place they are visible.
      </p>

      {error ? <p className="text-sm text-destructive">🔴 {error}</p> : null}
      {notice ? <p className="text-sm">🟢 {notice}</p> : null}
      {policyLine ? <p className="text-sm">{policyLine}</p> : null}

      {status === null ? (
        <p className="text-sm text-muted-foreground">Checking…</p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            {!status.policyTight && !status.policyError ? (
              <Button size="sm" onClick={tighten} disabled={busy}>
                Set R2 to clean up after 1 day
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline"
              onClick={cleanNow}
              disabled={busy || status.rows.length === 0}
            >
              Clean up now
            </Button>
          </div>

          {status.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              🟢 Nothing stranded. Every upload this bucket has seen either finished or has been
              cleaned up.
            </p>
          ) : (
            <div className="flex flex-col">
              <p className="pb-1 text-xs text-muted-foreground">
                {status.rows.length} unfinished upload(s), {status.cleanable} old enough to clean up
                (over {ORPHAN_MAX_AGE_HOURS} h). A newer one is left alone in case it is still
                running.
              </p>
              {status.rows.map((r, i) => (
                <div
                  key={r.uploadId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 text-sm"
                >
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate" title={r.objectKey}>
                    {r.objectKey.split("/").pop() ?? r.objectKey}
                  </span>
                  <span className="w-20 shrink-0 text-xs text-muted-foreground">
                    {r.ageHours === null
                      ? "age unknown"
                      : r.ageHours >= ORPHAN_MAX_AGE_HOURS
                        ? `🟡 ${Math.round(r.ageHours)} h`
                        : `${r.ageHours} h`}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {r.initiatedAt ? formatIST(r.initiatedAt) : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

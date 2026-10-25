"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { formatIST } from "@/lib/date";
import {
  adoptVaultUnownedRows,
  applyVaultOrphanPolicy,
  cleanVaultOrphans,
  deleteVaultUnreferenced,
  vaultOrphanStatus,
  vaultReconcile,
} from "@/features/vault/actions";
import {
  ORPHAN_MAX_AGE_HOURS,
  UPLOAD_QUIET_HOURS,
  type VaultOrphanStatus,
  type VaultReconcileReport,
} from "@/features/vault/types";

/** Bytes as a person reads them. Local copy so this panel stands on its own. */
function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

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
  const [report, setReport] = useState<VaultReconcileReport | null>(null);
  // Deleting real bytes asks twice. Aborting an incomplete upload cannot destroy a file
  // and so needs no confirmation; these objects could be anything.
  const [confirmDelete, setConfirmDelete] = useState(false);
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
    // 🔴 A report belongs to the bucket it was run against. Leaving a stale one on
    // screen after a bucket switch would invite a delete aimed at the wrong bucket.
    setReport(null);
    setConfirmDelete(false);
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

  const runReconcile = () => {
    setBusy(true);
    setNotice(null);
    setConfirmDelete(false);
    void (async () => {
      const r = await vaultReconcile(bucketId);
      if (!r.ok) setError(r.error);
      else setReport(r.data ?? null);
      setBusy(false);
    })();
  };

  const removeUnreferenced = () => {
    setBusy(true);
    setNotice(null);
    void (async () => {
      const r = await deleteVaultUnreferenced(bucketId);
      if (!r.ok) setError(r.error);
      else if (r.data) {
        setNotice(
          `Removed ${r.data.deleted} unreferenced object(s), ${humanBytes(r.data.bytes)} of storage.${
            r.data.failed > 0 ? ` ${r.data.failed} would not delete.` : ""
          }`,
        );
      }
      setConfirmDelete(false);
      const again = await vaultReconcile(bucketId);
      setReport(again.ok ? (again.data ?? null) : null);
      setBusy(false);
    })();
  };

  const adopt = () => {
    setBusy(true);
    setNotice(null);
    void (async () => {
      const r = await adoptVaultUnownedRows(bucketId);
      if (!r.ok) setError(r.error);
      else if (r.data) {
        setNotice(
          `${r.data.adopted} file(s) that had lost their workspace are visible in the vault again. Nothing was deleted.`,
        );
      }
      const again = await vaultReconcile(bucketId);
      setReport(again.ok ? (again.data ?? null) : null);
      setBusy(false);
    })();
  };

  // One place turns the Vault's cutoff into words, so the button and the status line
  // can never disagree with the rule that actually gets written.
  const policyDays = `${Math.max(1, Math.round(ORPHAN_MAX_AGE_HOURS / 24))} day(s)`;

  const policyLine = !status
    ? null
    : status.policyError
      ? `🟡 Cannot read this bucket's cleanup rule: ${status.policyError}`
      : status.abortDays === null
        ? `🟡 No cleanup rule on this bucket, so R2's default of ${status.defaultDays} days applies. An unfinished upload is billed for ${status.defaultDays} days before R2 drops it.`
        : status.policyTight
          ? `🟢 R2 aborts unfinished uploads after ${status.abortDays} day(s), by its own rule. Nothing in this app has to be running.`
          : `🟡 This bucket's rule aborts unfinished uploads after ${status.abortDays} days. Tightening it to ${policyDays} stops them being billed for a week.`;

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
                Set R2 to clean up after {policyDays}
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
            <Button size="sm" variant="outline" onClick={runReconcile} disabled={busy}>
              Check bucket against the database
            </Button>
          </div>

          {status.rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              🟢 No unfinished uploads. Every upload this bucket has seen either finished or has
              been cleaned up.
            </p>
          ) : (
            <div className="flex flex-col">
              <p className="pb-1 text-xs text-muted-foreground">
                {status.rows.length} unfinished upload(s), {status.cleanable} safe to clean up.
                Cleaning up needs two things: older than {ORPHAN_MAX_AGE_HOURS} h, and no new part
                for {UPLOAD_QUIET_HOURS} h. A big file on a slow line is old without being
                abandoned, so age alone is never enough.
              </p>
              {status.activeUploads > 0 ? (
                <p className="pb-1 text-sm">
                  🟢 {status.activeUploads} of these {status.activeUploads === 1 ? "is" : "are"}{" "}
                  still receiving parts right now and will not be touched at any age.
                </p>
              ) : null}
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

          {report ? <ReconcileReport report={report} /> : null}

          {report && !report.complete ? (
            <p className="text-sm">
              🟡 This bucket holds more objects than one pass can list, so nothing here can be
              called unreferenced and no deletion is offered.
            </p>
          ) : null}

          {report && report.complete && report.deletable.length > 0 ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">
                  🔴 Delete {report.deletable.length} object(s),{" "}
                  {humanBytes(report.deletable.reduce((n, o) => n + o.sizeBytes, 0))}? This cannot
                  be undone.
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-destructive/40 text-destructive"
                  onClick={removeUnreferenced}
                  disabled={busy}
                >
                  Yes, delete them
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="self-start"
                onClick={() => setConfirmDelete(true)}
                disabled={busy}
              >
                Delete the {report.deletable.length} unreferenced object(s)
              </Button>
            )
          ) : null}

          {report && report.unowned > 0 ? (
            <Button size="sm" variant="outline" className="self-start" onClick={adopt} disabled={busy}>
              Restore {report.unowned} file(s) that lost their workspace
            </Button>
          ) : null}
        </>
      )}
    </div>
  );
}

/**
 * The two-way comparison, as plain sentences.
 *
 * Ordered by what actually hurts, not by what costs money: a row whose object is gone
 * is a broken link on somebody's live page, while an object nobody references is a few
 * cents a month. The cheap problem was the one that got noticed first, so this screen
 * puts the expensive one at the top.
 */
function ReconcileReport({ report }: { report: VaultReconcileReport }) {
  const deletableBytes = report.deletable.reduce((n, o) => n + o.sizeBytes, 0);
  const foreignBytes = report.foreign.reduce((n, o) => n + o.sizeBytes, 0);
  const unprovableBytes = report.unprovable.reduce((n, o) => n + o.sizeBytes, 0);

  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <p className="text-sm font-medium">Bucket against the database</p>
      <p className="text-xs text-muted-foreground">
        {report.objectCount} object(s) in R2, {report.rowCount} row(s) in the vault.
      </p>

      {report.missing.length > 0 ? (
        <div className="flex flex-col gap-1">
          <p className="text-sm">
            🔴 {report.missing.length} file(s) are listed in the vault but are not in the bucket.
            Their public links are dead, and anything that pasted one is broken. Nothing is deleted
            automatically here - the row is the only record left, and re-uploading under it is
            usually the repair.
          </p>
          {report.missing.slice(0, 10).map((m) => (
            <p key={m.fileId} className="truncate pl-4 text-xs text-muted-foreground" title={m.objectKey}>
              {m.name} · {m.objectKey}
            </p>
          ))}
        </div>
      ) : (
        <p className="text-sm">🟢 Every file the vault lists is really in the bucket.</p>
      )}

      {report.deletable.length > 0 ? (
        <p className="text-sm">
          🟡 {report.deletable.length} object(s), {humanBytes(deletableBytes)}, that this database
          records uploading and that nothing in the vault points at any more. Billed, and still
          reachable by anyone holding the link. These are the only ones deletion will touch.
        </p>
      ) : (
        <p className="text-sm">🟢 No stranded objects this install can account for.</p>
      )}

      {report.unprovable.length > 0 ? (
        <p className="text-sm">
          🟡 {report.unprovable.length} object(s), {humanBytes(unprovableBytes)}, look like this app
          uploaded them but this database has no record of them. That is what another environment
          sharing this bucket looks like, production files seen from staging for instance. They are
          never offered for deletion, because nothing here can prove they are leftovers rather than
          files another install is still using.
        </p>
      ) : null}

      {report.foreign.length > 0 ? (
        <p className="text-sm">
          {report.foreign.length} object(s), {humanBytes(foreignBytes)}, were not uploaded by this
          app - a transfer, a hand upload, or another tool sharing the bucket. Counted here so the
          storage adds up, never offered for deletion.
        </p>
      ) : null}

      {report.tooNew.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          {report.tooNew.length} unreferenced object(s) are newer than {ORPHAN_MAX_AGE_HOURS} h and
          are left alone, in case an upload is still finishing.
        </p>
      ) : null}

      {report.unowned > 0 ? (
        <p className="text-sm">
          🟡 {report.unowned} file(s) lost their workspace when a tenant was deleted. Every listing
          filters by workspace, so they are invisible in the vault while their storage is still
          billed and their links still work.
        </p>
      ) : null}

      {report.stalePending > 0 ? (
        <p className="text-xs text-muted-foreground">
          {report.stalePending} reservation(s) whose upload was never confirmed. Opening this page
          checks each one against R2: if the file is really there it is restored into the vault, and
          only a reservation with nothing behind it is dropped.
        </p>
      ) : null}
    </div>
  );
}

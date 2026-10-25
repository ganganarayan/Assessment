"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatIST } from "@/lib/date";
import {
  confirmVaultUpload,
  createVaultFolder,
  createVaultUploadTicket,
  deleteVaultBucket,
  deleteVaultFile,
  deleteVaultFolder,
  discardVaultUpload,
  listVaultFolder,
  listVaultFolderTree,
  listVaultActivity,
  type VaultActivityRow,
  moveVaultFile,
  moveVaultFileToBucket,
  renameVaultFile,
  renameVaultFolder,
  saveVaultBucket,
  signVaultParts,
  startVaultMultipart,
  completeVaultMultipart,
  abortVaultMultipart,
  testVaultBucket,
  vaultBucketReadiness,
  applyVaultCors,
} from "@/features/vault/actions";
import {
  ALLOWED_CONTENT_TYPES,
  type VaultBucketReadiness,
  type VaultBucketView,
  type VaultListingView,
} from "@/features/vault/types";
import { Housekeeping } from "@/features/vault/components/vault-housekeeping";

/**
 * The Vault: buckets, folders, files, and the link you hand to VidaPulse.
 *
 * Mobile first - every row stacks, and the actions on a file sit under its name rather
 * than in a column that would push the name off a phone screen.
 *
 * 🔴 UPLOADS NEVER TOUCH THIS APP'S SERVER. The action mints a presigned PUT, XHR sends
 * the bytes straight to R2 (XHR rather than fetch purely because it reports upload
 * progress, which a several-hundred-megabyte video needs), and a second action
 * confirms the object landed. A Server Action would die on its body limit and would
 * bill Railway egress for something R2 serves free.
 */

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = n / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

/** "1m 24s" / "48s". Short enough to sit on one line next to a filename. */
function humanDuration(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  if (total < 60) return `${total}s`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

interface UploadState {
  name: string;
  percent: number;
  error: string | null;
  /** When the transfer began, for the running clock. */
  startedAt: number;
  /** Frozen once it finishes, so a completed row stops counting. */
  finishedMs: number | null;
  /** Set once the server has confirmed the bytes landed. */
  done: boolean;
  /** The reservation, so a cancel can throw the row away rather than strand it. */
  fileId: string | null;
  /** Present only while in flight. Calling it aborts the PUT. */
  abort: (() => void) | null;
}

/**
 * Explain a transport failure by HOW FAR IT GOT, which is the only thing that
 * distinguishes the two completely different causes.
 *
 * 🔴 Zero bytes sent means the browser never got permission to send: the CORS preflight
 * is decided before the body moves, so a wrong CORS rule fails here at 0%.
 *
 * 🔴 Some bytes sent means CORS already PASSED - the preflight succeeded and the body
 * was flowing - and the connection died mid-flight. Blaming CORS in that case sends
 * someone to re-read a policy that was never the problem, which is exactly what the
 * first version of this did.
 */
function describeTransportFailure(sent: number, total: number): string {
  if (sent === 0) {
    return (
      "The browser could not send anything to R2, so this is almost certainly the bucket's " +
      "CORS rule - the browser asks permission before any bytes move. Check the CORS policy " +
      "includes this exact origin."
    );
  }
  const percent = total > 0 ? Math.round((sent / total) * 100) : 0;
  return (
    `The connection to R2 dropped after ${percent}% had been sent. CORS is NOT the problem - ` +
    `the upload had already started, which means permission was granted. This is the network ` +
    `between you and Cloudflare. Try again; there is no resume yet, so it restarts from the beginning.`
  );
}

/** PUT the bytes to R2, reporting progress. Resolves on 2xx, rejects otherwise. */
function putWithProgress(
  url: string,
  file: File,
  onProgress: (percent: number) => void,
  /** Handed the aborter as soon as the request exists, so a Cancel button can stop it. */
  onStart?: (abort: () => void) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    onStart?.(() => xhr.abort());
    // How much actually left the machine, so a failure can be described by distance
    // travelled rather than guessed at.
    let sent = 0;
    xhr.open("PUT", url, true);
    xhr.setRequestHeader("content-type", file.type);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        sent = e.loaded;
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      reject(
        new Error(
          xhr.status === 0
            ? describeTransportFailure(sent, file.size)
            : `R2 refused the upload (HTTP ${xhr.status}).`,
        ),
      );
    };
    xhr.onerror = () => reject(new Error(describeTransportFailure(sent, file.size)));
    xhr.onabort = () =>
      reject(new Error("The upload was cancelled before it finished. Nothing was stored."));
    xhr.send(file);
  });
}

/** 8 MiB, matching PART_SIZE on the server. Over R2's 5 MiB floor for a non-final part. */
const PART_SIZE = 8 * 1024 * 1024;
/** How many parts ride at once. The real cure for a bucket an ocean away: one stream is
 *  capped by round-trip time rather than bandwidth, four are not. */
const PART_CONCURRENCY = 4;
/** Per part, not per file - which is the whole point of doing it this way. */
const PART_ATTEMPTS = 4;

/** PUT one part and return its ETag, which R2 needs to stitch the file back together. */
function putPart(url: string, blob: Blob, onDelta: (bytes: number) => void): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    let counted = 0;
    xhr.open("PUT", url, true);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) {
        // Report the DELTA: the caller is summing bytes across parts running at once,
        // so handing it a per-part total would count the same bytes repeatedly.
        onDelta(e.loaded - counted);
        counted = e.loaded;
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (!etag) {
          // Needs ExposeHeaders: ["ETag"] in the bucket's CORS policy, or the browser
          // can see the response but not this header, and completion is impossible.
          reject(new Error("R2 accepted the part but the browser could not read its ETag. Add ETag to ExposeHeaders in the bucket's CORS policy."));
          return;
        }
        resolve(etag);
        return;
      }
      reject(new Error(`R2 refused a part (HTTP ${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("A part failed to upload."));
    xhr.onabort = () => reject(new Error("aborted"));
    // Rolled back so a retry of this part does not double-count what it already sent.
    const rollback = () => onDelta(-counted);
    xhr.addEventListener("error", rollback);
    xhr.addEventListener("abort", rollback);
    xhr.send(blob);
  });
}

export function VaultConsole({ initialBuckets }: { initialBuckets: VaultBucketView[] }) {
  const [buckets, setBuckets] = useState(initialBuckets);
  const [bucketId, setBucketId] = useState<string | null>(initialBuckets[0]?.id ?? null);
  const [listing, setListing] = useState<VaultListingView | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [folderTree, setFolderTree] = useState<{ id: string; path: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [newFolder, setNewFolder] = useState("");
  const [showBucketForm, setShowBucketForm] = useState(initialBuckets.length === 0);
  const [editingBucket, setEditingBucket] = useState<VaultBucketView | null>(null);
  const [pending, start] = useTransition();
  // Drives the elapsed clock. Runs ONLY while an upload is in flight, so an idle Vault
  // is not re-rendering once a second for nothing.
  const [now, setNow] = useState(() => Date.now());
  const anyInFlight = uploads.some((u) => !u.done && !u.error);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(
    async (targetBucket: string | null, targetFolder: string | null) => {
      if (!targetBucket) {
        setListing(null);
        return;
      }
      const [r, tree] = await Promise.all([
        listVaultFolder(targetBucket, targetFolder),
        listVaultFolderTree(targetBucket),
      ]);
      if (!r.ok) {
        setError(r.error);
        setListing(null);
        return;
      }
      setListing(r.data ?? null);
      setFolderTree(tree.ok ? (tree.data ?? []) : []);
    },
    [],
  );

  useEffect(() => {
    void refresh(bucketId, folderId);
  }, [bucketId, folderId, refresh]);

  useEffect(() => {
    if (!anyInFlight) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [anyInFlight]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMessage?: string) =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await fn();
      if (!r.ok) return setError(r.error ?? "That didn't work.");
      if (okMessage) setNotice(okMessage);
      await refresh(bucketId, folderId);
    });

  /* ------------------------------------------------------------- uploading --- */

  const onPickFiles = async (files: FileList | null) => {
    if (!files || !bucketId) return;
    setError(null);
    setNotice(null);
    const list = Array.from(files);
    setUploads(
      list.map((f) => ({
        name: f.name,
        percent: 0,
        error: null,
        done: false,
        fileId: null,
        abort: null,
        startedAt: Date.now(),
        finishedMs: null,
      })),
    );

    for (let i = 0; i < list.length; i++) {
      const file = list[i];
      if (!file) continue;
      const setOne = (patch: Partial<UploadState>) =>
        setUploads((prev) => prev.map((u, idx) => (idx === i ? { ...u, ...patch } : u)));
      // The clock the row shows while it works, and freezes when it stops.
      const startedAt = Date.now();

      // The browser leaves type blank for some containers (.mkv, odd .mov exports), and
      // an empty content type would be stored and then served as a download rather
      // than a video. Caught here, with the fix stated.
      if (!file.type) {
        setOne({
          error:
            "The browser could not tell what type this file is. Re-export it as .mp4 (H.264) and try again.",
        });
        continue;
      }
      if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
        setOne({ error: `${file.type} is not an allowed file type here.` });
        continue;
      }

      // Small files keep the single PUT: fewer round trips and nothing to stitch back
      // together. Anything larger goes in parts, which is what makes it survivable -
      // a drop then costs one part instead of the whole file.
      if (file.size > PART_SIZE) {
        await uploadInParts(file, bucketId, folderId, setOne);
        continue;
      }

      const ticket = await createVaultUploadTicket({
        bucketId,
        folderId,
        filename: file.name,
        contentType: file.type,
        sizeBytes: file.size,
      });
      // Narrowed in two steps, not one: `!ticket.ok || !ticket.data` leaves the union
      // unnarrowed, so `.error` is not readable on it.
      if (!ticket.ok) {
        setOne({ error: ticket.error });
        continue;
      }
      if (!ticket.data) {
        setOne({ error: "R2 did not return an upload URL." });
        continue;
      }
      const fileId = ticket.data.fileId;
      setOne({ fileId });
      try {
        await putWithProgress(
          ticket.data.url,
          file,
          (percent) => setOne({ percent }),
          (abort) => setOne({ abort }),
        );
      } catch (e) {
        setOne({ error: e instanceof Error ? e.message : String(e), abort: null, finishedMs: Date.now() - startedAt });
        await discardVaultUpload(fileId);
        continue;
      }
      const confirmed = await confirmVaultUpload(fileId);
      if (!confirmed.ok) {
        setOne({ error: confirmed.error, abort: null, finishedMs: Date.now() - startedAt });
        await discardVaultUpload(fileId);
        continue;
      }
      setOne({ percent: 100, done: true, abort: null, finishedMs: Date.now() - startedAt });
      continue;
    }

    if (fileInput.current) fileInput.current.value = "";
    await refresh(bucketId, folderId);
  };

  /**
   * Upload one file in parts, several at a time, retrying parts rather than files.
   *
   * 🔴 THIS EXISTS BECAUSE ONE PUT WAS NOT SURVIVABLE. A 54 MB file failed three times
   * at 25%, 67% and 49%, each time losing everything, and a 1 GB file over the same
   * link would never have finished. Here a dropped part costs that part, and four parts
   * in flight at once is what actually lifts throughput to a bucket on another
   * continent, where a single stream is limited by round-trip time and not by bandwidth.
   */
  const uploadInParts = async (
    file: File,
    targetBucket: string,
    targetFolder: string | null,
    setOne: (patch: Partial<UploadState>) => void,
  ): Promise<void> => {
    const startedAt = Date.now();
    const started = await startVaultMultipart({
      bucketId: targetBucket,
      folderId: targetFolder,
      filename: file.name,
      contentType: file.type,
      sizeBytes: file.size,
    });
    if (!started.ok) {
      setOne({ error: started.error });
      return;
    }
    if (!started.data) {
      setOne({ error: "R2 did not open the upload." });
      return;
    }
    const { fileId, uploadId } = started.data;
    setOne({ fileId });

    let cancelled = false;
    setOne({
      abort: () => {
        cancelled = true;
      },
    });

    const partCount = Math.max(1, Math.ceil(file.size / PART_SIZE));
    const partNumbers = Array.from({ length: partCount }, (_, i) => i + 1);

    let sent = 0;
    const bumpSent = (delta: number) => {
      sent += delta;
      setOne({ percent: Math.min(99, Math.round((sent / file.size) * 100)) });
    };

    const etags: { partNumber: number; etag: string }[] = [];

    try {
      // Signatures are fetched in batches rather than one per part: a 1 GB file is 128
      // parts, and a round trip each would undo the robustness this is here for.
      for (let offset = 0; offset < partNumbers.length; offset += 64) {
        if (cancelled) throw new Error("aborted");
        const batch = partNumbers.slice(offset, offset + 64);
        const signed = await signVaultParts(fileId, uploadId, batch);
        if (!signed.ok || !signed.data) throw new Error(signed.ok ? "No URLs returned." : signed.error);

        const queue = [...signed.data];
        const workers = Array.from({ length: Math.min(PART_CONCURRENCY, queue.length) }, async () => {
          for (;;) {
            const next = queue.shift();
            if (!next) return;
            if (cancelled) throw new Error("aborted");
            const start = (next.partNumber - 1) * PART_SIZE;
            const blob = file.slice(start, Math.min(start + PART_SIZE, file.size));

            let lastError: unknown = null;
            for (let attempt = 1; attempt <= PART_ATTEMPTS; attempt++) {
              if (cancelled) throw new Error("aborted");
              try {
                const etag = await putPart(next.url, blob, bumpSent);
                etags.push({ partNumber: next.partNumber, etag });
                lastError = null;
                break;
              } catch (e) {
                lastError = e;
                if (e instanceof Error && e.message === "aborted") throw e;
                // Back off before retrying, so a momentary problem is not hammered.
                await new Promise((r) => setTimeout(r, 400 * attempt));
              }
            }
            if (lastError) throw lastError;
          }
        });
        await Promise.all(workers);
      }

      const done = await completeVaultMultipart(fileId, uploadId, etags);
      if (!done.ok) throw new Error(done.error);
      setOne({ percent: 100, done: true, abort: null, finishedMs: Date.now() - startedAt });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setOne({
        error: msg === "aborted" ? "Cancelled. Nothing was stored." : msg,
        abort: null,
      });
      // Always abort at R2: the parts of an incomplete multipart upload are billed and
      // are invisible in the bucket listing, so skipping this leaks storage silently.
      await abortVaultMultipart(fileId, uploadId);
    }
  };

  const cancelUpload = async (index: number) => {
    const target = uploads[index];
    if (!target) return;
    target.abort?.();
    setUploads((prev) =>
      prev.map((u, i) =>
        i === index ? { ...u, abort: null, error: "Cancelled. Nothing was stored." } : u,
      ),
    );
    // 🔴 DELIBERATELY DOES NOT CLEAN UP HERE. Each upload path already tears itself down
    // when its request aborts: the single PUT discards its reservation, and the
    // multipart path aborts at R2 first, which is what stops the parts of an incomplete
    // upload being billed invisibly. Deleting the row from here would race that, win,
    // and leave abortVaultMultipart with no row to work from - so the parts would be
    // paid for forever with nothing in the app that knows they exist.
    await refresh(bucketId, folderId);
  };

  const clearFinishedUploads = () => setUploads([]);

  /* ---------------------------------------------------------------- render --- */

  const bucket = listing?.bucket ?? buckets.find((b) => b.id === bucketId) ?? null;
  const needsSetup = !!bucket && !bucket.publicBaseUrl;

  return (
    <div className="flex flex-col gap-6">
      {/* Bucket switcher */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {buckets.map((b) => (
            <Button
              key={b.id}
              variant={b.id === bucketId ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setBucketId(b.id);
                setFolderId(null);
                setError(null);
                setNotice(null);
              }}
            >
              {b.label}
              <span className="ml-2 text-xs opacity-70">{b.fileCount}</span>
            </Button>
          ))}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEditingBucket(null);
              setShowBucketForm((v) => !v);
            }}
          >
            {showBucketForm ? "Close" : "Add bucket"}
          </Button>
          {bucket ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setEditingBucket(bucket);
                setShowBucketForm(true);
              }}
            >
              Edit {bucket.label}
            </Button>
          ) : null}
        </div>
        {bucket ? (
          <p className="text-xs text-muted-foreground">
            {bucket.bucketName} · {bucket.fileCount} file(s) · {humanBytes(bucket.totalBytes)} ·{" "}
            {bucket.storageClass === "STANDARD" ? "Standard" : "Infrequent Access"} ·{" "}
            {bucket.publicBaseUrl ?? "no public domain yet"}
          </p>
        ) : null}
        {bucket ? <BucketReadiness bucketId={bucket.id} /> : null}
      </div>

      {error ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          🔴 {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm">
          🟢 {notice}
        </p>
      ) : null}

      {showBucketForm ? (
        <BucketForm
          key={editingBucket?.id ?? "new"}
          existing={editingBucket}
          siblings={buckets}
          onSaved={async (savedId) => {
            setShowBucketForm(false);
            setEditingBucket(null);
            const r = await listVaultFolder(savedId, null);
            if (r.ok && r.data) {
              setBuckets((prev) => {
                const without = prev.filter((b) => b.id !== savedId);
                return [...without, r.data!.bucket].sort((a, b) => a.label.localeCompare(b.label));
              });
            }
            setBucketId(savedId);
            setFolderId(null);
            setNotice("Bucket saved.");
          }}
          onDeleted={(deletedId) => {
            setBuckets((prev) => prev.filter((b) => b.id !== deletedId));
            setShowBucketForm(false);
            setEditingBucket(null);
            setBucketId((prev) => (prev === deletedId ? null : prev));
            setNotice("Bucket removed from the vault.");
          }}
        />
      ) : null}

      {needsSetup && bucket ? <SetupChecklist bucket={bucket} /> : null}

      {bucket ? (
        <>
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="underline-offset-4 hover:underline"
              onClick={() => setFolderId(null)}
            >
              {bucket.label}
            </button>
            {(listing?.trail ?? []).map((t) => (
              <span key={t.id} className="flex items-center gap-1">
                <span className="text-muted-foreground">/</span>
                <button
                  type="button"
                  className="underline-offset-4 hover:underline"
                  onClick={() => setFolderId(t.id)}
                >
                  {t.name}
                </button>
              </span>
            ))}
          </div>

          {/* New folder + upload */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="vault-new-folder" className="text-xs">
                New folder here
              </Label>
              <div className="flex gap-2">
                <Input
                  id="vault-new-folder"
                  value={newFolder}
                  onChange={(e) => setNewFolder(e.target.value)}
                  placeholder="Assess360 VSLs"
                />
                <Button
                  variant="outline"
                  disabled={pending || !newFolder.trim()}
                  onClick={() =>
                    run(async () => {
                      const r = await createVaultFolder(bucket.id, folderId, newFolder);
                      if (r.ok) setNewFolder("");
                      return r;
                    })
                  }
                >
                  Create
                </Button>
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="vault-upload" className="text-xs">
                Upload into this folder
              </Label>
              <input
                id="vault-upload"
                ref={fileInput}
                type="file"
                multiple
                className="text-sm"
                onChange={(e) => void onPickFiles(e.target.files)}
              />
            </div>
          </div>

          {uploads.length > 0 ? (
            <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
              {uploads.map((u, i) => (
                <div key={`${u.name}-${i}`} className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {u.error ? "🔴" : u.done ? "🟢" : "⬆️"} {u.name}
                      {u.done ? (
                        <span className="ml-2 font-medium text-emerald-600">Uploaded</span>
                      ) : !u.error ? (
                        <span className="ml-2 text-muted-foreground">{u.percent}%</span>
                      ) : null}
                      {/* Ticks while it runs, freezes on the final figure. `now` is the
                          only reason this re-renders once a second. */}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {humanDuration(u.finishedMs ?? now - u.startedAt)}
                      </span>
                    </span>
                    {/* Only while it is actually in flight: a cancel offered after the
                        fact would promise something it cannot do. */}
                    {u.abort ? (
                      <Button size="sm" variant="ghost" onClick={() => void cancelUpload(i)}>
                        Cancel
                      </Button>
                    ) : null}
                  </div>
                  {!u.error && !u.done ? (
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--muted)]">
                      <div
                        className="h-full bg-green-600 transition-all"
                        style={{ width: `${u.percent}%` }}
                      />
                    </div>
                  ) : null}
                  {u.error ? <span className="text-xs text-destructive">{u.error}</span> : null}
                </div>
              ))}
              {uploads.every((u) => u.done || u.error) ? (
                <Button size="sm" variant="ghost" className="self-start" onClick={clearFinishedUploads}>
                  Clear
                </Button>
              ) : null}
            </div>
          ) : null}

          {/* Folders */}
          {(listing?.folders ?? []).map((f) => (
            <FolderRow
              key={f.id}
              name={f.name}
              fileCount={f.fileCount}
              folderCount={f.folderCount}
              pending={pending}
              onOpen={() => setFolderId(f.id)}
              onRename={(name) => run(() => renameVaultFolder(f.id, name))}
              onDelete={() => run(() => deleteVaultFolder(f.id), "Folder deleted.")}
            />
          ))}

          {/* Files */}
          {(listing?.files ?? []).map((f, i) => (
            <FileRow
              key={f.id}
              index={i + 1}
              file={f}
              buckets={buckets}
              currentBucketId={bucket.id}
              folderTree={folderTree}
              pending={pending}
              onRename={(name) => run(() => renameVaultFile(f.id, name))}
              onMoveFolder={(target) => run(() => moveVaultFile(f.id, target), "Moved.")}
              onMoveBucket={(target) =>
                run(
                  () => moveVaultFileToBucket(f.id, target),
                  "Moved to the other bucket. Its public link has changed - update anywhere it was pasted.",
                )
              }
              onDelete={() => run(() => deleteVaultFile(f.id), "File deleted.")}
              onCopied={() => setNotice("Link copied.")}
            />
          ))}

          {/* A column, not a row: collapsed these are two small buttons, but expanded
              each is a full width panel, and a flex row would squeeze them. */}
          <div className="flex flex-col items-stretch gap-2">
            <ActivityLog bucketId={bucket.id} />
            <Housekeeping bucketId={bucket.id} />
          </div>

          {listing && listing.folders.length === 0 && listing.files.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing here yet. Create a folder, or upload straight into this one.
            </p>
          ) : null}
        </>
      ) : buckets.length === 0 ? null : (
        <p className="text-sm text-muted-foreground">Pick a bucket above.</p>
      )}
    </div>
  );
}

/* --------------------------------------------------------------------- rows --- */

function FolderRow({
  name,
  fileCount,
  folderCount,
  pending,
  onOpen,
  onRename,
  onDelete,
}: {
  name: string;
  fileCount: number;
  folderCount: number;
  pending: boolean;
  onOpen: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(name);
  return (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
      {renaming ? (
        <div className="flex flex-1 gap-2">
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} />
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              onRename(draft);
              setRenaming(false);
            }}
          >
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <>
          <button type="button" className="text-left font-medium" onClick={onOpen}>
            📁 {name}
            <span className="ml-2 text-xs text-muted-foreground">
              {folderCount} folder(s), {fileCount} file(s)
            </span>
          </button>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setRenaming(true)}>
              Rename
            </Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={onDelete}>
              Delete
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function FileRow({
  index,
  file,
  buckets,
  currentBucketId,
  folderTree,
  pending,
  onRename,
  onMoveFolder,
  onMoveBucket,
  onDelete,
  onCopied,
}: {
  index: number;
  file: VaultListingView["files"][number];
  buckets: VaultBucketView[];
  currentBucketId: string;
  folderTree: { id: string; path: string }[];
  pending: boolean;
  onRename: (name: string) => void;
  onMoveFolder: (folderId: string | null) => void;
  onMoveBucket: (bucketId: string) => void;
  onDelete: () => void;
  onCopied: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState(file.name);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const others = buckets.filter((b) => b.id !== currentBucketId);

  if (renaming) {
    return (
      <div className="flex items-center gap-2 border-b px-2 py-1.5">
        <span className="w-6 shrink-0 text-xs text-muted-foreground">{index}</span>
        <Input value={draft} onChange={(e) => setDraft(e.target.value)} className="h-8" />
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            onRename(draft);
            setRenaming(false);
          }}
        >
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setRenaming(false)}>
          Cancel
        </Button>
      </div>
    );
  }

  return (
    // ONE LINE per file. It wraps on a phone rather than scrolling sideways, which is
    // the only way "one line" and mobile-first are both true.
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 text-sm">
      <span className="w-6 shrink-0 text-xs text-muted-foreground">{index}</span>
      <span className="min-w-0 flex-1 truncate font-medium" title={file.name}>
        {file.name}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {humanBytes(file.sizeBytes)}
      </span>
      <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
        {file.contentType}
      </span>
      <span className="shrink-0 text-xs text-muted-foreground">
        {file.uploadedAt ? formatIST(file.uploadedAt) : ""}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        {file.publicUrl ? (
          <Button
            size="sm"
            className="h-7"
            onClick={async () => {
              await navigator.clipboard.writeText(file.publicUrl as string);
              onCopied();
            }}
          >
            Copy link
          </Button>
        ) : (
          <span className="text-xs text-amber-600">no public link</span>
        )}
        <Button size="sm" variant="outline" className="h-7" onClick={() => setRenaming(true)}>
          Rename
        </Button>
        <select
          className="h-7 rounded-md border bg-background px-1 text-xs"
          value={file.folderId ?? ""}
          disabled={pending}
          onChange={(e) => onMoveFolder(e.target.value || null)}
          aria-label="Move to folder"
        >
          <option value="">(root)</option>
          {folderTree.map((f) => (
            <option key={f.id} value={f.id}>
              {f.path}
            </option>
          ))}
        </select>
        {others.length > 0 ? (
          <select
            className="h-7 rounded-md border bg-background px-1 text-xs"
            value=""
            disabled={pending}
            onChange={(e) => {
              const target = e.target.value;
              if (!target) return;
              const ok = window.confirm(
                "Moving between buckets changes this file’s public link. Anything already pasted into a page or an LMS will stop working. Continue?",
              );
              e.target.value = "";
              if (ok) onMoveBucket(target);
            }}
            aria-label="Move to another bucket"
          >
            <option value="">Bucket…</option>
            {others.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        ) : null}
        {confirmDelete ? (
          <>
            <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={onDelete}>
              Really?
            </Button>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmDelete(false)}>
              Keep
            </Button>
          </>
        ) : (
          <Button size="sm" variant="ghost" className="h-7" onClick={() => setConfirmDelete(true)}>
            Delete
          </Button>
        )}
      </span>
    </div>
  );
}

/* --------------------------------------------------------------- activity log --- */

/**
 * Everything that has happened in this bucket, including to files that are gone.
 *
 * Reads from vault_activity, not from the file table - which is the point. A log built
 * by listing current files could never answer "what did I delete", and the upload
 * durations would vanish with the rows they belonged to.
 */
function ActivityLog({ bucketId }: { bucketId: string }) {
  const [rows, setRows] = useState<VaultActivityRow[] | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await listVaultActivity(bucketId, 200);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setError(null);
    setRows(r.data ?? []);
  }, [bucketId]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Collapsed by default: it is a reference, not something to scroll past on the way
  // to the files.
  if (!open) {
    return (
      <Button variant="outline" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Activity log
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="font-medium">Activity log</span>
        <Button size="sm" variant="ghost" onClick={() => void load()}>
          Refresh
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          Hide
        </Button>
      </div>
      {error ? <p className="text-sm text-destructive">🔴 {error}</p> : null}
      {rows === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nothing logged yet. Uploads and deletes from here on will appear.
        </p>
      ) : (
        <div className="flex flex-col">
          {rows.map((r, i) => (
            <div
              key={r.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-2 py-1.5 text-sm"
            >
              <span className="w-6 shrink-0 text-xs text-muted-foreground">{i + 1}</span>
              <span className="w-20 shrink-0 text-xs font-medium">
                {r.action === "UPLOADED"
                  ? "🟢 Upload"
                  : r.action === "DELETED"
                    ? "🔴 Delete"
                    : r.action === "ABORTED"
                      ? "🟡 Abort"
                      : r.action === "RENAMED"
                        ? "Rename"
                        : "Move"}
              </span>
              <span
                className={`min-w-0 flex-1 truncate ${r.stillExists ? "" : "text-muted-foreground line-through"}`}
                title={r.name}
              >
                {r.name}
              </span>
              {/* Blank for an abort rather than "0 B": R2's list of incomplete uploads
                  does not report how many bytes were already sent, and a zero there
                  would read as a fact. */}
              <span className="shrink-0 text-xs text-muted-foreground">
                {r.action === "ABORTED" ? "" : humanBytes(r.sizeBytes)}
              </span>
              {/* The headline number for an upload. Blank for everything else rather
                  than a dash, so the column reads as "this took this long". */}
              <span className="w-16 shrink-0 text-xs text-muted-foreground">
                {r.durationMs !== null ? humanDuration(r.durationMs) : ""}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatIST(r.at)}</span>
              {r.detail ? (
                <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                  {r.detail}
                </span>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- setup checklist --- */

/**
 * What the S3 API cannot do for you.
 *
 * Shown rather than automated because attaching a custom domain and setting CORS need
 * the Cloudflare dashboard or a separate Cloudflare API token, and the same pattern is
 * already how custom domains work in this app: show the exact values, let the operator
 * paste them, do not pretend to own the step.
 */
function SetupChecklist({ bucket }: { bucket: VaultBucketView }) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-amber-500/40 bg-amber-500/5 px-3 py-3 text-sm">
      <p className="font-medium">🟡 One step left, in Cloudflare</p>
      <ol className="flex list-decimal flex-col gap-2 pl-5">
        <li>
          <span className="font-medium">Attach a custom domain.</span> R2 → {bucket.bucketName} →
          Settings → Public access → Custom domains. Use a hostname on a zone in this Cloudflare
          account, then paste it into this bucket&apos;s Public URL above. Do not enable the r2.dev
          URL: it is rate limited and uncached, so video through it stutters and every request
          bills a read.
        </li>
        {bucket.storageClass === "INFREQUENT_ACCESS" ? (
          <li>
            <span className="font-medium">Set the default storage class to Infrequent Access</span>{" "}
            on the bucket, since that is what this bucket is marked as here. Correct for a cold
            archive, wrong for anything served often: Infrequent Access bills $0.01 per GB
            retrieved, so every video play would cost a retrieval.
          </li>
        ) : null}
      </ol>
    </div>
  );
}


/* ------------------------------------------------------------- readiness --- */

/**
 * Whether a browser here can upload to this bucket, and where the bucket lives.
 *
 * 🔴 CORS IS PER BUCKET, so a bucket created five minutes ago allows no browser at all
 * and its first upload dies at 0% with an error the browser will not explain. This
 * strip exists so that is a sentence and a button instead of a debugging session.
 *
 * The region is shown beside it because it is the single largest factor in upload
 * speed, it is fixed at creation and cannot be changed, and until now the only way to
 * find out was to go and look in Cloudflare.
 */
function BucketReadiness({ bucketId }: { bucketId: string }) {
  const [state, setState] = useState<VaultBucketReadiness | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    setState(null);
    setProblem(null);
    const r = await vaultBucketReadiness(bucketId);
    if (r.ok && r.data) setState(r.data);
    else setProblem(r.ok ? "No answer." : r.error);
  }, [bucketId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allow = async () => {
    setBusy(true);
    setProblem(null);
    try {
      const r = await applyVaultCors(bucketId);
      if (!r.ok) setProblem(r.error);
      else await load();
    } finally {
      setBusy(false);
    }
  };

  if (problem) return <p className="text-xs text-destructive">🔴 {problem}</p>;
  if (!state) return <p className="text-xs text-muted-foreground">Checking the bucket…</p>;

  // An unreadable policy is not a failed one. Saying "not allowed" when the truth is
  // "this token cannot read the policy" would send the operator to fix the wrong thing.
  if (state.error) {
    return (
      <p className="text-xs text-muted-foreground">
        🟡 Could not read this bucket&apos;s CORS policy: {state.error}. The token may lack
        permission for it, which does not stop uploads if the policy is already right.
      </p>
    );
  }

  const others = state.corsOrigins.filter((o) => o !== state.origin);

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <span>Region {state.location ?? "default"}</span>
      <span>·</span>
      {state.corsOk ? (
        <span>
          🟢 Uploads allowed from this site
          {others.length > 0 ? ` and ${others.length} other origin(s)` : ""}
        </span>
      ) : (
        <>
          <span className="text-foreground">
            🟡 {state.corsConfigured
              ? "This bucket's CORS policy does not cover this site, so an upload would fail before any bytes move."
              : "This bucket has no CORS policy, so no browser can upload to it yet."}
          </span>
          <Button size="sm" variant="outline" onClick={() => void allow()} disabled={busy}>
            {busy ? "Allowing…" : "Allow uploads from this site"}
          </Button>
        </>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- bucket form --- */

function BucketForm({
  existing,
  siblings,
  onSaved,
  onDeleted,
}: {
  existing: VaultBucketView | null;
  /** The other buckets already here, whose stored token this one can borrow. */
  siblings: VaultBucketView[];
  onSaved: (id: string) => void | Promise<void>;
  onDeleted: (id: string) => void;
}) {
  const [label, setLabel] = useState(existing?.label ?? "");
  const [bucketName, setBucketName] = useState(existing?.bucketName ?? "");
  const [publicBaseUrl, setPublicBaseUrl] = useState(existing?.publicBaseUrl ?? "");
  const [storageClass, setStorageClass] = useState<"STANDARD" | "INFREQUENT_ACCESS">(
    existing?.storageClass ?? "STANDARD",
  );
  const [accountId, setAccountId] = useState(existing?.accountId ?? "");
  const [accessKeyId, setAccessKeyId] = useState(existing?.accessKeyId ?? "");
  const [secretAccessKey, setSecretAccessKey] = useState("");
  // 🟢 An R2 API token scoped to the account works for every bucket under it, and
  // Cloudflare shows a secret exactly once. Asking the operator to paste it again for
  // a second bucket in the same account asks for something they probably no longer
  // have, so they can point at a bucket here instead and the server reuses its secret.
  const [copyCredsFrom, setCopyCredsFrom] = useState("");
  const [createInR2, setCreateInR2] = useState(false);
  // Only meaningful on create. R2 fixes a bucket location permanently, and it is the
  // dominant factor in upload speed, so it is asked rather than defaulted.
  const [locationHint, setLocationHint] = useState<string>("apac");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const save = () =>
    start(async () => {
      setError(null);
      setNotice(null);
      const r = await saveVaultBucket({
        id: existing?.id,
        label,
        bucketName,
        publicBaseUrl,
        storageClass,
        accountId,
        accessKeyId,
        secretAccessKey,
        copyCredsFrom,
        createInR2,
        locationHint: createInR2 ? (locationHint as "apac") : "",
      });
      if (!r.ok) return setError(r.error);
      setSecretAccessKey("");
      setCreateInR2(false);
      await onSaved(r.data?.id ?? existing?.id ?? "");
    });

  const test = () =>
    start(async () => {
      if (!existing) return setError("Save the bucket first, then test it.");
      setError(null);
      setNotice(null);
      const r = await testVaultBucket(existing.id);
      if (!r.ok) return setError(r.error);
      setNotice(`Works - wrote and deleted a test object in ${r.data?.ms ?? 0}ms.`);
    });

  const remove = () =>
    start(async () => {
      if (!existing) return;
      setError(null);
      const r = await deleteVaultBucket(existing.id);
      if (!r.ok) return setError(r.error);
      onDeleted(existing.id);
    });

  const field = (
    id: string,
    labelText: string,
    hint: string,
    value: string,
    onChange: (v: string) => void,
    placeholder: string,
    type: "text" | "password" = "text",
  ) => (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{labelText}</Label>
      <Input
        id={id}
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4 rounded-md border px-3 py-4">
      <p className="font-medium">{existing ? `Edit ${existing.label}` : "Add a bucket"}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        {field("v-label", "Label", "What this bucket is called here.", label, setLabel, "CDN")}
        {field(
          "v-bucket",
          "R2 bucket name",
          "The real bucket name in Cloudflare. Lowercase, numbers and hyphens.",
          bucketName,
          setBucketName,
          "assess-cdn",
        )}
        {field(
          "v-public",
          "Public URL",
          "The custom domain serving this bucket. Leave blank until it is attached.",
          publicBaseUrl,
          setPublicBaseUrl,
          "https://cdn.example.com",
        )}
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-class">Storage class</Label>
          <select
            id="v-class"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={storageClass}
            onChange={(e) =>
              setStorageClass(e.target.value === "INFREQUENT_ACCESS" ? "INFREQUENT_ACCESS" : "STANDARD")
            }
          >
            <option value="STANDARD">Standard - for anything served</option>
            <option value="INFREQUENT_ACCESS">Infrequent Access - for a cold archive</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Standard for video and images. Infrequent Access is cheaper to keep but bills per GB
            read, so it is wrong for anything played often.
          </p>
        </div>
        {!existing && siblings.length > 0 ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <Label htmlFor="v-copy">Credentials</Label>
            <select
              id="v-copy"
              className="h-9 rounded-md border bg-background px-2 text-sm"
              value={copyCredsFrom}
              onChange={(e) => {
                const id = e.target.value;
                setCopyCredsFrom(id);
                const src = siblings.find((b) => b.id === id);
                if (src) {
                  setAccountId(src.accountId);
                  setAccessKeyId(src.accessKeyId);
                  setSecretAccessKey("");
                }
              }}
            >
              <option value="">Paste a new token below</option>
              {siblings.map((b) => (
                <option key={b.id} value={b.id}>
                  Same token as {b.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              An account-scoped R2 token works for every bucket in the account, so a second
              bucket needs no new one. The secret is read on the server and never shown here.
              Pick &quot;paste a new token&quot; only if the existing one is scoped to one bucket.
            </p>
          </div>
        ) : null}
        {field(
          "v-account",
          "Cloudflare account id",
          "From the R2 overview page.",
          accountId,
          setAccountId,
          "",
        )}
        {field(
          "v-key",
          "Access key id",
          "An R2 API token. Account-scoped if you want cross-bucket moves.",
          accessKeyId,
          setAccessKeyId,
          "",
        )}
        {field(
          "v-secret",
          "Secret access key",
          existing?.hasSecret
            ? "A secret is stored. Leave blank to keep it, or paste a new one to replace it."
            : copyCredsFrom
              ? "Not needed - the token above is being reused."
              : "Shown once by Cloudflare when the token is created.",
          secretAccessKey,
          setSecretAccessKey,
          existing?.hasSecret ? "•••••••• stored" : "",
          "password",
        )}
      </div>

      {!existing ? (
        <label className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            checked={createInR2}
            onChange={(e) => setCreateInR2(e.target.checked)}
            className="mt-1"
          />
          <span>
            Also create this bucket in R2 now.
            <span className="block text-xs text-muted-foreground">
              Leave unticked if you already made it in Cloudflare. Creating needs an account-scoped
              token, and it still cannot attach the domain or set CORS - those stay manual.
            </span>
          </span>
        </label>
      ) : null}

      {!existing && createInR2 ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="v-location">Bucket location</Label>
          <select
            id="v-location"
            className="h-9 rounded-md border bg-background px-2 text-sm"
            value={locationHint}
            onChange={(e) => setLocationHint(e.target.value)}
          >
            <option value="apac">Asia Pacific - closest to India</option>
            <option value="wnam">Western North America</option>
            <option value="enam">Eastern North America</option>
            <option value="weur">Western Europe</option>
            <option value="eeur">Eastern Europe</option>
            <option value="oc">Oceania</option>
            <option value="">Let Cloudflare choose</option>
          </select>
          <p className="text-xs text-amber-600">
            🔴 Permanent. R2 fixes a bucket&apos;s location at creation and it can never be
            changed, so moving later means a new bucket and re-uploading everything. This is also
            the biggest factor in upload speed: uploading from India to a North American bucket
            crosses the Pacific, and one stream over that latency cannot fill a fast line however
            much bandwidth it has.
          </p>
        </div>
      ) : null}

      {error ? <p className="text-sm text-destructive">🔴 {error}</p> : null}
      {notice ? <p className="text-sm text-emerald-600">🟢 {notice}</p> : null}

      <div className="flex flex-wrap gap-2">
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save bucket"}
        </Button>
        {existing ? (
          <Button variant="outline" onClick={test} disabled={pending}>
            Test connection
          </Button>
        ) : null}
        {existing ? (
          <Button variant="ghost" onClick={remove} disabled={pending}>
            Remove from vault
          </Button>
        ) : null}
      </div>
    </div>
  );
}

import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
  ListMultipartUploadsCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  type LifecycleRule,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";

/**
 * Per-bucket S3 clients for the Vault.
 *
 * Separate from lib/storage/r2, which holds ONE client for the whole install because
 * the app has one bucket. Here each bucket carries its own credentials, so the client
 * is built per bucket from a row rather than cached as a singleton.
 *
 * Built per call rather than cached. Constructing an S3Client is local work - no
 * network, no handshake - and a cache would need invalidating whenever an operator
 * rotates a key, which is precisely the moment a stale client reads as "the new key
 * does not work".
 */

export interface VaultBucketCreds {
  id: string;
  bucketName: string;
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string | null;
}

export class VaultBucketUnusableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VaultBucketUnusableError";
  }
}

/** Load a bucket row and decrypt its secret, or explain why it cannot be used. */
export async function loadBucketCreds(bucketId: string): Promise<VaultBucketCreds> {
  const row = await prisma.vaultBucket.findUnique({
    where: { id: bucketId },
    select: {
      id: true,
      bucketName: true,
      accountId: true,
      accessKeyId: true,
      secretAccessKeyEnc: true,
      publicBaseUrl: true,
    },
  });
  if (!row) throw new VaultBucketUnusableError("That bucket no longer exists.");
  const secret = decryptWithSecret(row.secretAccessKeyEnc, env.BETTER_AUTH_SECRET);
  if (!secret) {
    // Decryption fails when BETTER_AUTH_SECRET changed after the row was saved. Saying
    // so is the difference between a five-minute fix and an afternoon on R2's docs.
    throw new VaultBucketUnusableError(
      "This bucket's stored secret could not be decrypted. Re-enter the secret access key for it.",
    );
  }
  return {
    id: row.id,
    bucketName: row.bucketName,
    accountId: row.accountId,
    accessKeyId: row.accessKeyId,
    secretAccessKey: secret,
    publicBaseUrl: row.publicBaseUrl,
  };
}

export function clientFor(creds: VaultBucketCreds): S3Client {
  return new S3Client({
    region: "auto",
    endpoint: `https://${creds.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    },
    // 🔴 BOTH OF THESE ARE LOAD-BEARING FOR PRESIGNED BROWSER UPLOADS. Do not remove.
    //
    // Since v3.729 the AWS SDK adds an integrity checksum to PutObject by default. That
    // is correct for a server-side upload, where the SDK has the bytes and can hash
    // them. When PRESIGNING there is no body - so the SDK hashes an EMPTY one and bakes
    // x-amz-checksum-crc32 for nothing into the signed URL. The browser then sends the
    // real file, R2 reads all of it, computes the real checksum, finds the mismatch and
    // rejects the upload.
    //
    // The failure is brutal to read: the preflight passes and the body transfers, so
    // progress climbs normally and then dies at an arbitrary percentage that moves
    // between attempts. R2's error response carries no Access-Control-Allow-Origin, so
    // the browser will not surface the status and reports a bare network error - which
    // reads exactly like a flaky connection and is not one. A 54 MB file failed twice
    // this way before the signed URL was actually inspected.
    //
    // WHEN_REQUIRED keeps checksums for operations that genuinely need them and stops
    // the SDK volunteering one it cannot compute. scripts/verify-vault.ts asserts the
    // generated URL stays free of checksum parameters, so an SDK upgrade cannot quietly
    // put this back.
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });
}

/**
 * A presigned PUT the browser uploads to directly.
 *
 * 🔴 THE BYTES NEVER PASS THROUGH THIS APP. A 300 MB video posted to a Server Action
 * dies on the body limit, and proxying it through Railway would bill egress for
 * something R2 serves for free. The browser PUTs straight to R2 and this app only
 * mints the signature and records the row.
 *
 * 🟡 STORAGE CLASS IS NOT SIGNED HERE, on purpose. Including it would put
 * x-amz-storage-class into the signed headers, so an upload would fail its signature
 * check unless the browser reproduced the header exactly - a fragile contract for no
 * gain. R2 applies the BUCKET's default storage class instead, which is set once in
 * Cloudflare; VaultBucket.storageClass records what that setting should be and drives
 * the setup checklist.
 */
export async function presignUpload(
  creds: VaultBucketCreds,
  objectKey: string,
  contentType: string,
): Promise<string> {
  const client = clientFor(creds);
  return getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: creds.bucketName,
      Key: objectKey,
      ContentType: contentType,
    }),
    // Long enough for a large file on a slow line, short enough that a leaked URL is
    // not a standing write grant. The signature covers the key, so the worst a leaked
    // ticket can do is overwrite the one object it was minted for.
    { expiresIn: 60 * 60 * 6 },
  );
}

/** Confirm an object really landed, and report its true size. */
export async function headObject(
  creds: VaultBucketCreds,
  objectKey: string,
): Promise<{ size: number; contentType: string | null } | null> {
  const client = clientFor(creds);
  try {
    const res = await client.send(
      new HeadObjectCommand({ Bucket: creds.bucketName, Key: objectKey }),
    );
    return {
      size: Number(res.ContentLength ?? 0),
      contentType: res.ContentType ?? null,
    };
  } catch {
    // Absent or unreadable both mean "do not mark this upload complete".
    return null;
  }
}

export async function deleteObject(creds: VaultBucketCreds, objectKey: string): Promise<void> {
  const client = clientFor(creds);
  await client.send(new DeleteObjectCommand({ Bucket: creds.bucketName, Key: objectKey }));
}

/**
 * Copy an object into another bucket, server side inside R2.
 *
 * 🟡 NEEDS ONE CREDENTIAL THAT CAN READ THE SOURCE AND WRITE THE DESTINATION, which
 * means an ACCOUNT-SCOPED R2 token. With a token scoped to a single bucket this fails
 * with AccessDenied, and the action turns that into an explanation rather than a stack
 * trace. The alternative - streaming the bytes down to Railway and back up - is
 * deliberately not implemented: for a 300 MB video it is slow, it bills egress, and it
 * would quietly become the normal path.
 */
export async function copyObjectAcrossBuckets(
  dest: VaultBucketCreds,
  sourceBucketName: string,
  objectKey: string,
): Promise<void> {
  const client = clientFor(dest);
  await client.send(
    new CopyObjectCommand({
      Bucket: dest.bucketName,
      Key: objectKey,
      CopySource: `${sourceBucketName}/${objectKey}`,
    }),
  );
}

/**
 * Create the bucket in R2.
 *
 * 🟡 CREATING IS ALL THE S3 API CAN DO. It cannot attach a custom domain and it cannot
 * set CORS, both of which need the Cloudflare dashboard or a separate Cloudflare API
 * token. So a freshly created bucket is private and rejects browser uploads until the
 * two manual steps are done, and the UI shows exactly what to paste.
 */
export async function createRemoteBucket(
  creds: VaultBucketCreds,
  locationHint?: string,
): Promise<void> {
  const client = clientFor(creds);
  await client.send(
    new CreateBucketCommand({
      Bucket: creds.bucketName,
      // 🔴 SET THIS, AND SET IT RIGHT THE FIRST TIME. R2 fixes a bucket's location at
      // creation and it can never be changed afterwards - moving means a new bucket and
      // re-uploading everything, which is why the field is on the create form.
      //
      // It is the single biggest factor in upload speed. Uploading from India to a
      // bucket in Western North America crosses the Pacific at ~230ms round trip, and
      // one TCP stream over that latency cannot fill a fast line however much bandwidth
      // it has: 28 MB took three minutes at ~160 KB/s. The first bucket here was created
      // with no hint, landed in WNAM, and that was the whole of the slowness.
      //
      // The SDK types this as AWS's own region enum, but R2 wants its own hints (apac,
      // wnam, enam, weur, eeur, oc), so the cast is deliberate rather than a shortcut.
      ...(locationHint
        ? {
            CreateBucketConfiguration: {
              LocationConstraint: locationHint as "us-west-1",
            },
          }
        : {}),
    }),
  );
}

/* ------------------------------------------------------------- multipart --- */

/**
 * Multipart upload: the only way a large file survives a real network.
 *
 * 🔴 WHY THIS REPLACED THE SINGLE PUT. One PUT is one TCP connection held open for the
 * whole transfer, and if anything breaks it the entire file restarts from zero. A 54 MB
 * file failed three times that way - at 25%, 67% and 49% - and a 1 GB file over the
 * same link would never finish. Multipart turns one long fragile request into many
 * short ones:
 *
 *   - a dropped part costs that part, not the file, and is retried on its own
 *   - parts upload in PARALLEL, which is what actually fixes throughput on a
 *     high-latency link: a single stream to a bucket an ocean away is limited by round
 *     trip time rather than by bandwidth, so several streams multiply it
 *   - progress is real, because it is measured in completed parts
 *
 * R2 requires every part except the last to be the same size, and at least 5 MiB.
 */

/** 8 MiB. Comfortably over R2's 5 MiB floor, and small enough that losing one is cheap. */
export const PART_SIZE = 8 * 1024 * 1024;

/** Below this a single PUT is simpler and needs fewer round trips. */
export const MULTIPART_THRESHOLD = PART_SIZE;

export async function startMultipart(
  creds: VaultBucketCreds,
  objectKey: string,
  contentType: string,
): Promise<string> {
  const client = clientFor(creds);
  const res = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: creds.bucketName,
      Key: objectKey,
      ContentType: contentType,
    }),
  );
  if (!res.UploadId) throw new Error("R2 did not return an upload id for the multipart upload.");
  return res.UploadId;
}

/**
 * Presign a batch of part uploads.
 *
 * Signed in batches rather than one per round trip: a 1 GB file is 128 parts, and
 * asking the server to sign each one separately would add 128 requests to a flow whose
 * whole point is to be robust.
 */
export async function presignParts(
  creds: VaultBucketCreds,
  objectKey: string,
  uploadId: string,
  partNumbers: number[],
): Promise<{ partNumber: number; url: string }[]> {
  const client = clientFor(creds);
  return Promise.all(
    partNumbers.map(async (partNumber) => ({
      partNumber,
      url: await getSignedUrl(
        client,
        new UploadPartCommand({
          Bucket: creds.bucketName,
          Key: objectKey,
          UploadId: uploadId,
          PartNumber: partNumber,
        }),
        { expiresIn: 60 * 60 * 6 },
      ),
    })),
  );
}

export async function completeMultipart(
  creds: VaultBucketCreds,
  objectKey: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<void> {
  const client = clientFor(creds);
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: creds.bucketName,
      Key: objectKey,
      UploadId: uploadId,
      MultipartUpload: {
        // R2 rejects a completion whose parts are out of order, and the browser finishes
        // them in whatever order the network allows, so sorting here is required.
        Parts: [...parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    }),
  );
}

/**
 * Abandon a multipart upload.
 *
 * 🟡 Not optional housekeeping. R2 keeps the parts of an incomplete multipart upload and
 * BILLS for them, while they are invisible in the bucket listing - so a cancelled or
 * failed upload that is never aborted is storage paid for forever and never seen.
 */
export async function abortMultipart(
  creds: VaultBucketCreds,
  objectKey: string,
  uploadId: string,
): Promise<void> {
  const client = clientFor(creds);
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: creds.bucketName,
      Key: objectKey,
      UploadId: uploadId,
    }),
  );
}

/* ------------------------------------------------- orphaned part cleanup --- */

/**
 * An incomplete multipart upload: parts sitting in R2 that never became an object.
 *
 * 🔴 WHY THIS IS NOT COSMETIC. R2 stores and BILLS the parts of an upload that was
 * started and never completed, and they appear in no object listing - not in the
 * Cloudflare file browser, not in this app. The only way to see them is to ask for them
 * by name, which is what this does.
 *
 * They are created by any upload that dies after parts have gone up but before the
 * abort call runs: a closed tab, a crashed page, a deploy restarting the app mid
 * upload. The abort in the browser is best effort by nature, because the code that
 * would send it is the code that just stopped running. That is exactly why the real
 * guarantee is the LIFECYCLE RULE below and not this listing.
 */
export interface IncompleteUpload {
  objectKey: string;
  uploadId: string;
  /** R2 reports this; null only if it ever stops doing so. */
  initiatedAt: Date | null;
}

/**
 * Every incomplete multipart upload in the bucket.
 *
 * Paginated, with a hard page ceiling: a runaway loop here would be a loop of billed
 * Class A requests. Twenty pages is twenty thousand uploads, which is far past any
 * state this vault can reach honestly.
 */
export async function listIncompleteUploads(creds: VaultBucketCreds): Promise<IncompleteUpload[]> {
  const client = clientFor(creds);
  const found: IncompleteUpload[] = [];
  let keyMarker: string | undefined;
  let uploadIdMarker: string | undefined;

  for (let page = 0; page < 20; page++) {
    const res = await client.send(
      new ListMultipartUploadsCommand({
        Bucket: creds.bucketName,
        KeyMarker: keyMarker,
        UploadIdMarker: uploadIdMarker,
        MaxUploads: 1000,
      }),
    );
    for (const u of res.Uploads ?? []) {
      if (!u.Key || !u.UploadId) continue;
      found.push({ objectKey: u.Key, uploadId: u.UploadId, initiatedAt: u.Initiated ?? null });
    }
    if (!res.IsTruncated) break;
    keyMarker = res.NextKeyMarker;
    uploadIdMarker = res.NextUploadIdMarker;
    // No marker to continue from. Stopping beats asking for page one again forever.
    if (!keyMarker && !uploadIdMarker) break;
  }
  return found;
}

/* ----------------------------------------------------------- lifecycle --- */

/**
 * 🟢 THE ACTUAL GUARANTEE. R2 can abort incomplete uploads itself, server side, on a
 * bucket lifecycle rule - no cron, no Worker, no browser, nothing in this app that has
 * to still be running. Every bucket already has an implicit 7 day default; setting this
 * rule tightens that, and it is the only mechanism that works when the app is down,
 * the tab is closed and nobody opens the Vault for a month.
 *
 * Cleanup in the app exists for the parts already stranded and for the owner who wants
 * to see the number go to zero now. It is the convenience, not the guarantee.
 */
const ABORT_RULE_ID = "vault-abort-incomplete-multipart";

/** What R2 does on its own when no rule says otherwise. */
export const R2_DEFAULT_ABORT_DAYS = 7;

/** A bucket with no lifecycle configuration at all is not an error, it is the default. */
function isMissingLifecycle(e: unknown): boolean {
  const name = e instanceof Error ? e.name : "";
  const message = e instanceof Error ? e.message : String(e);
  return /NoSuchLifecycleConfiguration/i.test(name) || /NoSuchLifecycleConfiguration/i.test(message);
}

/**
 * The abort deadline the bucket's own rules impose, in days, or null for "none set, so
 * R2's default applies".
 *
 * Only rules that apply to the WHOLE bucket count. A rule filtered to a prefix would
 * leave everything outside that prefix uncovered, so reporting it as the bucket's
 * policy would be a comforting lie.
 */
export async function readAbortDays(creds: VaultBucketCreds): Promise<number | null> {
  const client = clientFor(creds);
  let rules: LifecycleRule[] = [];
  try {
    const res = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: creds.bucketName }),
    );
    rules = res.Rules ?? [];
  } catch (e) {
    if (isMissingLifecycle(e)) return null;
    throw e;
  }

  let strictest: number | null = null;
  for (const rule of rules) {
    if (rule.Status && rule.Status !== "Enabled") continue;
    // A rule narrowed to a prefix, in either of the three places a prefix can hide,
    // leaves everything outside it uncovered - so it is not this bucket's policy.
    const prefix = rule.Filter?.Prefix ?? rule.Filter?.And?.Prefix ?? rule.Prefix ?? "";
    if (prefix !== "") continue;
    const days = rule.AbortIncompleteMultipartUpload?.DaysAfterInitiation;
    if (typeof days === "number" && (strictest === null || days < strictest)) strictest = days;
  }
  return strictest;
}

/**
 * Set the bucket's abort deadline.
 *
 * 🔴 MERGES, never replaces. PutBucketLifecycleConfiguration overwrites the entire
 * configuration, so a blind write would silently delete every other rule on the bucket
 * - including any storage class transition somebody set in the Cloudflare dashboard.
 * Existing rules are read back, ours is swapped in by id, the rest are written through
 * untouched.
 */
export async function writeAbortDays(creds: VaultBucketCreds, days: number): Promise<void> {
  const client = clientFor(creds);
  let existing: LifecycleRule[] = [];
  try {
    const res = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: creds.bucketName }),
    );
    existing = res.Rules ?? [];
  } catch (e) {
    if (!isMissingLifecycle(e)) throw e;
  }

  const kept = existing.filter((r) => r.ID !== ABORT_RULE_ID);

  // 🟡 TWO SHAPES, TRIED IN ORDER. A whole-bucket rule is expressed as an empty Filter
  // in the current S3 API and as a bare empty Prefix in the older one, and which of the
  // two R2 accepts is not something this code can know without asking it. Rejecting the
  // first is a validation error, not a permission error, so falling back costs one
  // request and avoids a feature that fails on a detail of XML shape.
  const shapes: LifecycleRule[] = [
    {
      ID: ABORT_RULE_ID,
      Status: "Enabled",
      Filter: { Prefix: "" },
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: days },
    },
    {
      ID: ABORT_RULE_ID,
      Status: "Enabled",
      Prefix: "",
      AbortIncompleteMultipartUpload: { DaysAfterInitiation: days },
    },
  ];

  let lastError: unknown = null;
  for (const rule of shapes) {
    try {
      await client.send(
        new PutBucketLifecycleConfigurationCommand({
          Bucket: creds.bucketName,
          LifecycleConfiguration: { Rules: [...kept, rule] },
        }),
      );
      return;
    } catch (e) {
      lastError = e;
      // An access problem will not be fixed by a different rule shape, so stop.
      const msg = e instanceof Error ? e.message : String(e);
      if (/accessdenied|forbidden|unauthorized|invalidaccesskey/i.test(msg)) break;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/* --------------------------------------------------------------- reconcile --- */

export interface BucketObject {
  objectKey: string;
  sizeBytes: number;
  lastModified: Date | null;
}

export interface BucketListing {
  objects: BucketObject[];
  /**
   * 🔴 FALSE MEANS NOTHING MAY BE DELETED. Reconcile decides an object is unreferenced
   * by not finding a row for it, and a row is missing by not finding its object. Both
   * conclusions are only valid if the listing is COMPLETE. A listing cut short by the
   * page ceiling would make every object past the cut look like a row with no file, and
   * every row past it look like a file with no object - and acting on either would
   * delete live data. So a truncated listing is reported as truncated and every
   * destructive path refuses.
   */
  complete: boolean;
}

/** 50 pages of 1000. Past that the vault is not the right tool and nothing is deleted. */
const MAX_LIST_PAGES = 50;

/** Every object in the bucket, with a flag saying whether that is really every object. */
export async function listAllObjects(creds: VaultBucketCreds): Promise<BucketListing> {
  const client = clientFor(creds);
  const objects: BucketObject[] = [];
  let token: string | undefined;

  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: creds.bucketName,
        ContinuationToken: token,
        MaxKeys: 1000,
      }),
    );
    for (const o of res.Contents ?? []) {
      if (!o.Key) continue;
      objects.push({
        objectKey: o.Key,
        sizeBytes: Number(o.Size ?? 0),
        lastModified: o.LastModified ?? null,
      });
    }
    if (!res.IsTruncated) return { objects, complete: true };
    token = res.NextContinuationToken;
    if (!token) return { objects, complete: true };
  }
  return { objects, complete: false };
}

/* ------------------------------------------------------- upload liveness --- */

export interface PartActivity {
  partCount: number;
  /** When the most recent part landed, which is the only honest liveness signal. */
  lastActivity: Date | null;
}

/**
 * Is this multipart upload still being written to?
 *
 * 🔴 THE QUESTION CLEANUP MUST ASK BEFORE IT DESTROYS ANYTHING. An upload is stranded
 * or alive, and the time it STARTED cannot tell the two apart: a 5 GB file on a slow
 * link legitimately takes many hours, and judging it by its start time would abort a
 * transfer that is working perfectly, losing hours of someone's bytes. What separates
 * them is whether parts are still arriving.
 *
 * R2 reports each part's LastModified, so the upload answers the question itself. A
 * recent part means a browser is still pushing; no recent part means nobody is.
 */
export async function partActivity(
  creds: VaultBucketCreds,
  objectKey: string,
  uploadId: string,
): Promise<PartActivity> {
  const client = clientFor(creds);
  let partCount = 0;
  let lastActivity: Date | null = null;
  let marker: number | undefined;

  for (let page = 0; page < 20; page++) {
    const res = await client.send(
      new ListPartsCommand({
        Bucket: creds.bucketName,
        Key: objectKey,
        UploadId: uploadId,
        PartNumberMarker: marker === undefined ? undefined : String(marker),
        MaxParts: 1000,
      }),
    );
    for (const part of res.Parts ?? []) {
      partCount++;
      if (part.LastModified && (!lastActivity || part.LastModified > lastActivity)) {
        lastActivity = part.LastModified;
      }
    }
    if (!res.IsTruncated) break;
    const next = res.NextPartNumberMarker;
    if (next === undefined || next === null) break;
    marker = Number(next);
  }
  return { partCount, lastActivity };
}

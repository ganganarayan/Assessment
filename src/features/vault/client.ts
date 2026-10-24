import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  CopyObjectCommand,
  CreateBucketCommand,
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
export async function createRemoteBucket(creds: VaultBucketCreds): Promise<void> {
  const client = clientFor(creds);
  await client.send(new CreateBucketCommand({ Bucket: creds.bucketName }));
}

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";

/**
 * Cloudflare R2 storage abstraction (S3-compatible).
 *
 * CONFIGURED IN SETTINGS, NOT ENV. Credentials live on the platform AppSetting row
 * (super-admin Settings), with the secret encrypted at rest. Environment variables hold
 * only what the app needs to boot; an integration that can be rotated without a deploy
 * belongs in the database.
 *
 * ONE BUCKET FOR THE INSTALL. Tenants are isolated by KEY PREFIX
 * (`tenants/<tenantId>/...`, see `tenantKey`), not by separate buckets or credentials.
 * One set of keys to rotate, and no tenant ever holds a credential that could reach
 * another tenant's objects. The prefix is built here so no caller composes a key by
 * hand — a hand-built key is how one tenant's file ends up under another's path.
 *
 * Storage stays OPTIONAL: the client is never created at import time, so the app boots
 * with nothing configured, and the first actual operation throws a clear error instead.
 *
 * The rest of the app depends on this `storage` interface, never on the AWS SDK
 * directly — so the backend stays swappable.
 */

interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicUrl: string;
}

let cachedClient: S3Client | null = null;
let cachedConfig: R2Config | null = null;

class StorageNotConfiguredError extends Error {
  constructor(missing: string[]) {
    super(
      `Cloudflare R2 storage is not configured. Missing: ${missing.join(", ")}. ` +
        `Set it in super-admin Settings → File storage. Storage is optional, so the ` +
        `rest of the app keeps working without it.`,
    );
    this.name = "StorageNotConfiguredError";
  }
}

/**
 * The object key for a tenant's file. ALWAYS go through this rather than building a
 * path: it is the one place that guarantees a tenant's objects sit under its own
 * prefix, which is the whole of the isolation story for a single shared bucket.
 *
 * `path` is sanitised because it can carry user-influenced text (a file name). A `..`
 * segment in an S3 key is not a traversal the way it is on a filesystem, but it makes
 * keys ambiguous and listings wrong, so it is stripped.
 */
export function tenantKey(tenantId: string, path: string): string {
  const clean = path
    .split("/")
    .map((seg) => seg.trim())
    .filter((seg) => seg.length > 0 && seg !== "." && seg !== "..")
    .join("/");
  if (!clean) throw new Error("Storage key path is empty.");
  return `tenants/${tenantId}/${clean}`;
}

/** True when storage is usable. Reads Settings; never throws. */
export async function isStorageConfigured(): Promise<boolean> {
  try {
    await loadConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget the cached credentials, so the next operation re-reads Settings.
 * Called by the settings save — otherwise a corrected key would not take effect until
 * the process restarted, which reads as "saving did nothing".
 */
export function resetStorageConfig(): void {
  cachedConfig = null;
  cachedClient = null;
}

/**
 * Read credentials from the platform settings row, caching them for the process.
 *
 * Cached because storage operations can run in a loop (a batch of reports) and a DB
 * round trip per object would be pure waste; `resetStorageConfig()` is how a settings
 * save invalidates it.
 */
async function loadConfig(): Promise<R2Config> {
  if (cachedConfig) return cachedConfig;

  const row = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      r2AccountId: true,
      r2AccessKeyId: true,
      r2SecretAccessKeyEnc: true,
      r2BucketName: true,
      r2PublicUrl: true,
    },
  });

  const trim = (v: string | null | undefined) => (v ?? "").trim() || null;
  const accountId = trim(row?.r2AccountId);
  const accessKeyId = trim(row?.r2AccessKeyId);
  const bucket = trim(row?.r2BucketName);
  const publicUrl = trim(row?.r2PublicUrl);

  // A secret that cannot be decrypted is treated as ABSENT, not as an error to throw
  // through the caller: it means the row was written under a different
  // BETTER_AUTH_SECRET (a copy between environments), and the honest report is
  // "not configured, re-enter it" rather than a crypto stack trace.
  let secretAccessKey: string | null = null;
  if (row?.r2SecretAccessKeyEnc) {
    try {
      secretAccessKey = trim(decryptWithSecret(row.r2SecretAccessKeyEnc, env.BETTER_AUTH_SECRET));
    } catch {
      secretAccessKey = null;
    }
  }

  const missing: string[] = [];
  if (!accountId) missing.push("Account ID");
  if (!accessKeyId) missing.push("Access key ID");
  if (!secretAccessKey) missing.push("Secret access key");
  if (!bucket) missing.push("Bucket name");
  if (!publicUrl) missing.push("Public URL");
  if (missing.length > 0) throw new StorageNotConfiguredError(missing);

  cachedConfig = {
    accountId: accountId as string,
    accessKeyId: accessKeyId as string,
    secretAccessKey: secretAccessKey as string,
    bucket: bucket as string,
    publicUrl: publicUrl as string,
  };
  return cachedConfig;
}

/** Lazily build (and cache) the S3 client on first use. */
async function getClient(): Promise<{ client: S3Client; config: R2Config }> {
  const config = await loadConfig();
  if (!cachedClient) {
    cachedClient = new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }
  return { client: cachedClient, config };
}

export interface UploadParams {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

export const storage = {
  /** Upload an object and return its public URL. */
  async upload({ key, body, contentType }: UploadParams): Promise<string> {
    const { client, config } = await getClient();
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return `${config.publicUrl}/${key}`;
  },

  /**
   * Fetch an object's bytes. Returns null when it does not exist, rather than throwing,
   * because "not stored yet" is a normal state every caller has to handle anyway — and
   * a missing file should fall back to rendering, not surface as an error to the user.
   *
   * Bytes rather than a stream on purpose: these are small documents, and the caller
   * streams them onward. Anything large enough to need a real stream should get its own
   * method rather than quietly making this one risky.
   */
  async download(key: string): Promise<Uint8Array | null> {
    const { client, config } = await getClient();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
      const body = res.Body as { transformToByteArray?: () => Promise<Uint8Array> } | undefined;
      if (!body?.transformToByteArray) return null;
      return await body.transformToByteArray();
    } catch (e) {
      // NoSuchKey is the expected miss. Anything else (credentials, network) is logged
      // and also treated as a miss, so a storage problem degrades to a fresh render
      // instead of denying the user their report.
      const name = e instanceof Error ? e.name : String(e);
      if (name !== "NoSuchKey" && name !== "NotFound") {
        console.error("[storage] download failed:", name);
      }
      return null;
    }
  },

  /** Delete an object by key. */
  async delete(key: string): Promise<void> {
    const { client, config } = await getClient();
    await client.send(
      new DeleteObjectCommand({ Bucket: config.bucket, Key: key }),
    );
  },

  /** Presigned URL for direct browser upload (PUT). */
  async signedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const { client, config } = await getClient();
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: contentType,
      }),
      { expiresIn: expiresInSeconds },
    );
  },

  /** Presigned URL for temporary private read (GET). */
  async signedDownloadUrl(
    key: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    const { client, config } = await getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },

  /** Stable public URL for an object in a public bucket. Async now that the base URL
   *  comes from Settings rather than a synchronously-available env var. */
  async publicUrl(key: string): Promise<string> {
    const { config } = await getClient();
    return `${config.publicUrl}/${key}`;
  },
};

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

/**
 * Cloudflare R2 storage abstraction (S3-compatible).
 *
 * Phase 1: R2 is OPTIONAL. The client is NOT created at import/startup time —
 * the app boots fine without any R2_* variables. The S3 client is built lazily
 * on the first storage operation, and if configuration is missing we throw a
 * clear, actionable error instead of crashing the whole app.
 *
 * The rest of the app depends on this `storage` interface, never on the AWS
 * SDK directly — so the backend stays swappable.
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
      `Cloudflare R2 storage is not configured. Missing env var(s): ${missing.join(
        ", ",
      )}. Set them in your Railway environment (or .env) to enable uploads. ` +
        `R2 is optional in Phase 1, so the app still runs without it.`,
    );
    this.name = "StorageNotConfiguredError";
  }
}

/** Returns true if every R2 variable is present. */
export function isStorageConfigured(): boolean {
  return (
    !!env.R2_ACCOUNT_ID &&
    !!env.R2_ACCESS_KEY_ID &&
    !!env.R2_SECRET_ACCESS_KEY &&
    !!env.R2_BUCKET_NAME &&
    !!env.R2_PUBLIC_URL
  );
}

/** Validate config the first time storage is actually used. */
function getConfig(): R2Config {
  if (cachedConfig) return cachedConfig;

  const missing: string[] = [];
  if (!env.R2_ACCOUNT_ID) missing.push("R2_ACCOUNT_ID");
  if (!env.R2_ACCESS_KEY_ID) missing.push("R2_ACCESS_KEY_ID");
  if (!env.R2_SECRET_ACCESS_KEY) missing.push("R2_SECRET_ACCESS_KEY");
  if (!env.R2_BUCKET_NAME) missing.push("R2_BUCKET_NAME");
  if (!env.R2_PUBLIC_URL) missing.push("R2_PUBLIC_URL");
  if (missing.length > 0) throw new StorageNotConfiguredError(missing);

  cachedConfig = {
    accountId: env.R2_ACCOUNT_ID as string,
    accessKeyId: env.R2_ACCESS_KEY_ID as string,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY as string,
    bucket: env.R2_BUCKET_NAME as string,
    publicUrl: env.R2_PUBLIC_URL as string,
  };
  return cachedConfig;
}

/** Lazily build (and cache) the S3 client on first use. */
function getClient(): { client: S3Client; config: R2Config } {
  const config = getConfig();
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
    const { client, config } = getClient();
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

  /** Delete an object by key. */
  async delete(key: string): Promise<void> {
    const { client, config } = getClient();
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
    const { client, config } = getClient();
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
    const { client, config } = getClient();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },

  /** Stable public URL for an object in a public bucket. */
  publicUrl(key: string): string {
    return `${getConfig().publicUrl}/${key}`;
  },
};

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
 * The rest of the app depends on this interface, never on the AWS SDK
 * directly — so the storage backend stays swappable.
 */

const client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export interface UploadParams {
  key: string;
  body: Buffer | Uint8Array | string;
  contentType: string;
}

export const storage = {
  /** Upload an object and return its public URL. */
  async upload({ key, body, contentType }: UploadParams): Promise<string> {
    await client.send(
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return storage.publicUrl(key);
  },

  /** Delete an object by key. */
  async delete(key: string): Promise<void> {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
        Key: key,
      }),
    );
  },

  /** Presigned URL for direct browser upload (PUT). */
  async signedUploadUrl(
    key: string,
    contentType: string,
    expiresInSeconds = 300,
  ): Promise<string> {
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: env.R2_BUCKET_NAME,
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
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: env.R2_BUCKET_NAME, Key: key }),
      { expiresIn: expiresInSeconds },
    );
  },

  /** Stable public URL for an object in a public bucket. */
  publicUrl(key: string): string {
    return `${env.R2_PUBLIC_URL}/${key}`;
  },
};

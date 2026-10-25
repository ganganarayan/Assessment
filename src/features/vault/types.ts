/**
 * Vault shared types and limits.
 *
 * A PLAIN MODULE, not an actions file: a "use server" file may export only async
 * functions, and a const exported from one fails the Railway build while local
 * typecheck passes. Everything here is a type or a constant, so it lives apart.
 */

export type VaultStorageClassValue = "STANDARD" | "INFREQUENT_ACCESS";

/**
 * 5 GiB, which is the hard ceiling on a SINGLE PutObject in the S3 API that R2
 * implements. Above this an upload has to be multipart, which P1 does not do - so the
 * limit is enforced before a ticket is issued rather than discovered as an opaque
 * failure three gigabytes into a browser upload.
 */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024 * 1024;

/**
 * What may be uploaded. An allowlist rather than a denylist: the vault's links are
 * public, so the question is not "is this dangerous" but "is this something we meant
 * to host". Anything serving as active content in a browser (html, svg, js) is left
 * out deliberately - a public bucket on a subdomain that can serve attacker-authored
 * HTML is a stored-XSS vector against that subdomain.
 */
export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  // Video, the case this was built for.
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "application/vnd.apple.mpegurl",
  "video/mp2t",
  // Audio.
  "audio/mpeg",
  "audio/mp4",
  "audio/aac",
  "audio/wav",
  "audio/webm",
  // Images.
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  // Documents.
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
  // Archives.
  "application/zip",
  "application/x-zip-compressed",
];

export interface VaultBucketView {
  id: string;
  label: string;
  bucketName: string;
  publicBaseUrl: string | null;
  storageClass: VaultStorageClassValue;
  accountId: string;
  accessKeyId: string;
  /** The secret is never sent to the client, only whether one is stored. */
  hasSecret: boolean;
  /** Counted for the "can I delete this" question and the storage line. */
  fileCount: number;
  totalBytes: number;
}

export interface VaultFolderView {
  id: string;
  name: string;
  parentId: string | null;
  fileCount: number;
  folderCount: number;
}

export interface VaultFileView {
  id: string;
  name: string;
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  folderId: string | null;
  uploadedAt: string | null;
  /** Null when the bucket has no public base URL yet, which is the setup-incomplete case. */
  publicUrl: string | null;
}

export interface VaultListingView {
  bucket: VaultBucketView;
  /** Root to the folder being viewed, for the breadcrumb. Empty at the root. */
  trail: { id: string; name: string }[];
  folderId: string | null;
  folders: VaultFolderView[];
  files: VaultFileView[];
}

export interface VaultUploadTicket {
  fileId: string;
  /** Presigned PUT. The browser sends the bytes here, never through this app. */
  url: string;
  objectKey: string;
}

/**
 * How old an incomplete multipart upload must be before cleanup aborts it.
 *
 * 🔴 NEVER LOWER THIS NEAR ZERO. Aborting an upload that is still running destroys it
 * from under the person watching the progress bar, and cleanup cannot tell a stalled
 * upload from a slow one - only an old one from a new one. A presigned part URL lives
 * six hours, so nothing legitimate is still in flight at twenty four. verify:vault
 * enforces a floor.
 */
export const ORPHAN_MAX_AGE_HOURS = 24;

/** An incomplete multipart upload as the Vault shows it. */
export interface VaultOrphanRow {
  objectKey: string;
  uploadId: string;
  /** ISO, or null if R2 reported no initiation time. */
  initiatedAt: string | null;
  /** Null when initiatedAt is null, which is the only case cleanup leaves alone. */
  ageHours: number | null;
}

export interface VaultOrphanStatus {
  /**
   * Days after which R2 aborts incomplete uploads by its own lifecycle rule. Null means
   * no rule is set on the bucket, so R2's implicit default applies.
   */
  abortDays: number | null;
  /** R2's implicit default, for the "no rule set" message. */
  defaultDays: number;
  /** True once the bucket's own rule is at or below the Vault's target. */
  policyTight: boolean;
  /** Everything incomplete right now, newest first. */
  rows: VaultOrphanRow[];
  /** How many of those are old enough for cleanup to abort. */
  cleanable: number;
  /**
   * Set when the bucket's credentials cannot read or write lifecycle rules. The listing
   * still works, so cleanup still works - only the permanent rule is out of reach.
   */
  policyError: string | null;
}

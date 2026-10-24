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

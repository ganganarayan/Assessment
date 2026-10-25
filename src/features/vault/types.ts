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
 * How quiet an upload must be before cleanup will treat it as abandoned.
 *
 * 🔴 THIS, NOT AGE, IS WHAT MAKES CLEANUP SAFE. A 5 GB file on a slow link can take
 * many hours, so the time an upload STARTED says nothing about whether it is alive.
 * What separates a stranded upload from a working one is whether parts are still
 * arriving. R2 timestamps every part, so cleanup asks the upload itself: if a part
 * landed within this window, something is still pushing and nothing is touched - no
 * matter how old the upload is.
 */
export const UPLOAD_QUIET_HOURS = 2;

/**
 * How old an incomplete multipart upload must be before cleanup aborts it.
 *
 * 🔴 NEVER LOWER THIS NEAR ZERO. Aborting an upload that is still running destroys it
 * from under the person watching the progress bar, and age alone cannot tell a stalled
 * upload from a slow one. verify:vault enforces a floor.
 *
 * Two days, not one, and the reason is R2 rather than this app. Cleanup here consults
 * UPLOAD_QUIET_HOURS and will never touch a live upload at any age, but the bucket
 * lifecycle rule derived from this number runs inside R2 and cannot: it sees only the
 * initiation time. One day would have R2 drop a genuine upload still running after
 * twenty five hours. Two days costs one extra day of storage on abandoned parts and
 * removes that cliff.
 */
export const ORPHAN_MAX_AGE_HOURS = 48;

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
  /**
   * How many are old enough AND quiet enough for cleanup to abort. An upload still
   * receiving parts is never counted here, whatever its age.
   */
  cleanable: number;
  /** Uploads still receiving parts right now. Never touched, at any age. */
  activeUploads: number;
  /**
   * Set when the bucket's credentials cannot read or write lifecycle rules. The listing
   * still works, so cleanup still works - only the permanent rule is out of reach.
   */
  policyError: string | null;
}

/* --------------------------------------------------------------- reconcile --- */

/** An object in R2 that no database row points at. */
export interface VaultUnreferencedObject {
  objectKey: string;
  sizeBytes: number;
  /** ISO, or null if R2 reported none. */
  lastModified: string | null;
  ageHours: number | null;
}

/** A row whose object is not in the bucket. Its public link is dead. */
export interface VaultMissingObject {
  fileId: string;
  name: string;
  objectKey: string;
  /** ISO. */
  uploadedAt: string | null;
}

/**
 * The two-way comparison between what is in the bucket and what the database believes.
 *
 * 🔴 EVERY DESTRUCTIVE PATH IS GATED ON `complete`. Both halves of this report are
 * conclusions drawn from absence - an object with no row, a row with no object - and
 * absence only means anything if the listing was exhaustive.
 */
export interface VaultReconcileReport {
  complete: boolean;
  objectCount: number;
  rowCount: number;
  /**
   * 🔴 THE ONLY OBJECTS THE VAULT WILL EVER DELETE, and every condition is required:
   * unreferenced by any row, minted by this app, older than the cutoff, AND named in
   * THIS database's activity log.
   *
   * That last one is the difference between evidence and a guess. "No row points at
   * this object" is an ABSENCE, and absence is exactly what a wrong database produces:
   * point a second install at the same bucket and every file in it has no row there, so
   * absence alone would have condemned all of them. An activity row naming the key is
   * POSITIVE proof that this install handled this object, and only then is its being
   * unreferenced meaningful.
   */
  deletable: VaultUnreferencedObject[];
  /**
   * Unreferenced and minted, but this database has never logged anything about them, so
   * there is no proof they belong to this install. Reported and left strictly alone -
   * this is where another environment's files would land, and where they stay safe.
   */
  unprovable: VaultUnreferencedObject[];
  /**
   * Unreferenced but NOT minted by this app: a cloud to cloud transfer, a hand upload,
   * another tool sharing the bucket. Reported so the storage is accounted for, never
   * offered for deletion, because the owner put them there on purpose.
   */
  foreign: VaultUnreferencedObject[];
  /** Unreferenced, minted, but newer than the age cutoff. Left alone for now. */
  tooNew: VaultUnreferencedObject[];
  /**
   * 🔴 Rows whose object is gone. These are the ones that actually hurt: the file list
   * shows them, the public link 404s, and anything that pasted that link is broken.
   * Never deleted automatically - the row is the only remaining record of the file, and
   * the right repair is usually a re-upload under the same row.
   */
  missing: VaultMissingObject[];
  /** Reservations that never completed and are now past the six hour ticket life. */
  stalePending: number;
  /**
   * Rows left with no tenant, which happens when a tenant is deleted and the SetNull on
   * the relation fires. Every normal query filters by tenant, so these become invisible
   * while their objects keep being billed. Adoptable rather than deletable.
   */
  unowned: number;
}

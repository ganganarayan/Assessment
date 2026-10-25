"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff, type AuthUser } from "@/lib/auth/guards";
import { actingConfigTenantId } from "@/lib/tenant/acting";
import { encryptWithSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  ALLOWED_CONTENT_TYPES,
  MAX_UPLOAD_BYTES,
  type VaultBucketView,
  type VaultFileView,
  type VaultFolderView,
  type VaultListingView,
  type VaultOrphanRow,
  type VaultOrphanStatus,
  type VaultUploadTicket,
  ORPHAN_MAX_AGE_HOURS,
} from "./types";
import { mintObjectKey, publicUrlFor, safeDisplayName } from "./keys";
import {
  abortMultipart,
  completeMultipart,
  copyObjectAcrossBuckets,
  presignParts,
  startMultipart,
  PART_SIZE,
  MULTIPART_THRESHOLD,
  createRemoteBucket,
  deleteObject,
  headObject,
  loadBucketCreds,
  presignUpload,
  listIncompleteUploads,
  readAbortDays,
  writeAbortDays,
  R2_DEFAULT_ABORT_DAYS,
  VaultBucketUnusableError,
} from "./client";

/**
 * Vault server actions - SUPER ADMIN only, every one of them.
 *
 * Owner vs staff: reading is open to any super admin, but anything that destroys bytes
 * or edits a credential is owner-only, matching how storage settings already behave.
 *
 * Rows are stamped with actingConfigTenantId(), never a raw nullable tenant id, so the
 * platform's own vault is owned by the PLATFORM tenant row rather than by nobody. That
 * is also what makes a per-tenant vault work later with no change here: enter a
 * workspace and the same actions read and write that workspace's rows.
 */

/* ----------------------------------------------------------------- helpers --- */

function fail(e: unknown, fallback: string): { ok: false; error: string } {
  if (e instanceof VaultBucketUnusableError) return { ok: false, error: e.message };
  const msg = e instanceof Error ? e.message : String(e);
  console.error("[vault]", msg);
  // The SDK's own message names the real cause (NoSuchBucket, AccessDenied,
  // InvalidAccessKeyId), which is the one thing needed to fix it - so it is passed
  // through rather than flattened into something reassuring and useless.
  return { ok: false, error: msg || fallback };
}

type OwnerCheck = { ok: true; user: AuthUser } | { ok: false; error: string };

/**
 * Super admin AND not staff. Returns the user, so an action that needs to stamp who
 * did something does not resolve the session a second time.
 */
async function requireOwner(): Promise<OwnerCheck> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return { ok: false, error: "Only an owner can change the vault." };
  return { ok: true, user: me };
}

interface BucketRowForView {
  id: string;
  label: string;
  bucketName: string;
  publicBaseUrl: string | null;
  storageClass: "STANDARD" | "INFREQUENT_ACCESS";
  accountId: string;
  accessKeyId: string;
  secretAccessKeyEnc: string;
  files: { sizeBytes: bigint }[];
}

function bucketView(row: BucketRowForView): VaultBucketView {
  return {
    id: row.id,
    label: row.label,
    bucketName: row.bucketName,
    publicBaseUrl: row.publicBaseUrl,
    storageClass: row.storageClass,
    accountId: row.accountId,
    accessKeyId: row.accessKeyId,
    // The secret itself is never returned - the editor shows whether one is SET and
    // lets you replace it. Sending it back would put a live credential in a page
    // payload for no reason.
    hasSecret: !!row.secretAccessKeyEnc,
    fileCount: row.files.length,
    // bigint is mapped to Number at the boundary deliberately: a bigint cannot cross
    // to the client, and Number is exact to 9 petabytes, past anything this will hold.
    totalBytes: row.files.reduce((sum, f) => sum + Number(f.sizeBytes), 0),
  };
}

/* ----------------------------------------------------------------- buckets --- */

export async function listVaultBuckets(): Promise<ActionResult<VaultBucketView[]>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const rows = await prisma.vaultBucket.findMany({
      where: { tenantId },
      orderBy: { createdAt: "asc" },
      include: { files: { where: { uploadedAt: { not: null } }, select: { sizeBytes: true } } },
    });
    return { ok: true, data: rows.map(bucketView) };
  } catch (e) {
    return fail(e, "Couldn't load the vault buckets.");
  }
}

const bucketInput = z.object({
  id: z.string().min(1).optional(),
  label: z.string().min(1, "Give the bucket a label.").max(120),
  bucketName: z
    .string()
    .min(3, "An R2 bucket name is at least 3 characters.")
    .max(63)
    // Cloudflare's own naming rule. Checked here because a bad name does not fail at
    // save time, it fails at the first operation with an error about signatures.
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Lowercase letters, numbers and hyphens only."),
  publicBaseUrl: z.string().max(300),
  storageClass: z.enum(["STANDARD", "INFREQUENT_ACCESS"]),
  accountId: z.string().min(1, "The Cloudflare account id is required.").max(100),
  accessKeyId: z.string().min(1, "The access key id is required.").max(200),
  /** Blank on an edit leaves the stored secret alone. */
  secretAccessKey: z.string().max(400),
  /** True = also create the bucket in R2. False = it exists already, just register it. */
  createInR2: z.boolean(),
  /** R2 location hint, used ONLY when creating. Fixed forever at creation, and the
   *  dominant factor in upload speed, so it is asked for rather than defaulted. */
  locationHint: z.enum(["", "apac", "wnam", "enam", "weur", "eeur", "oc"]),
});

export type VaultBucketInput = z.infer<typeof bucketInput>;

export async function saveVaultBucket(
  input: VaultBucketInput,
): Promise<ActionResult<{ id: string }>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;

  const parsed = bucketInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That bucket is not valid." };
  }
  const v = parsed.data;

  // The public base URL decides every link this bucket hands out, so it is validated
  // hard rather than stored hopefully.
  let publicBaseUrl: string | null = null;
  const raw = v.publicBaseUrl.trim();
  if (raw) {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return { ok: false, error: "The public URL is not a valid URL." };
    }
    if (url.protocol !== "https:") {
      return { ok: false, error: "The public URL must start with https://." };
    }
    // 🟡 r2.dev is Cloudflare's DEVELOPMENT URL: rate limited, and not CDN-cached, so
    // every range request of every video play bills a Class B read and plays back
    // worse under load. Refusing it is the difference between finding that out now and
    // finding it out when a launch stutters.
    if (/(^|\.)r2\.dev$/i.test(url.hostname)) {
      return {
        ok: false,
        error:
          "That is the r2.dev development URL. It is rate limited and not cached, so video served through it stutters and every request bills a read. Attach a custom domain to the bucket in Cloudflare and use that hostname here.",
      };
    }
    if (url.pathname !== "/" && url.pathname !== "") {
      return { ok: false, error: "The public URL should be the hostname only, with no path." };
    }
    publicBaseUrl = `${url.protocol}//${url.host}`;
  }

  if (!v.id && !v.secretAccessKey.trim()) {
    return { ok: false, error: "Paste the secret access key for this bucket." };
  }

  try {
    const tenantId = await actingConfigTenantId();

    const data: {
      label: string;
      bucketName: string;
      publicBaseUrl: string | null;
      storageClass: "STANDARD" | "INFREQUENT_ACCESS";
      accountId: string;
      accessKeyId: string;
      secretAccessKeyEnc?: string;
    } = {
      label: safeDisplayName(v.label),
      bucketName: v.bucketName.trim(),
      publicBaseUrl,
      storageClass: v.storageClass,
      accountId: v.accountId.trim(),
      accessKeyId: v.accessKeyId.trim(),
    };
    if (v.secretAccessKey.trim()) {
      data.secretAccessKeyEnc = encryptWithSecret(v.secretAccessKey.trim(), env.BETTER_AUTH_SECRET);
    }

    let id: string;
    if (v.id) {
      const existing = await prisma.vaultBucket.findFirst({
        where: { id: v.id, tenantId },
        select: { id: true },
      });
      if (!existing) return { ok: false, error: "That bucket is not in this vault." };
      await prisma.vaultBucket.update({ where: { id: v.id }, data });
      id = v.id;
    } else {
      const created = await prisma.vaultBucket.create({
        data: {
          ...data,
          secretAccessKeyEnc: data.secretAccessKeyEnc as string,
          tenantId,
        },
        select: { id: true },
      });
      id = created.id;
    }

    // Creating in R2 happens AFTER the row exists, so "created remotely but lost
    // locally" cannot happen. The reverse - a row whose bucket does not exist yet - is
    // visible in the UI and fixable by saving again.
    if (v.createInR2) {
      try {
        const creds = await loadBucketCreds(id);
        await createRemoteBucket(creds, v.locationHint || undefined);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        // Already owned means the operator ticked Create for a bucket that exists,
        // which is harmless and must not read as a failure.
        if (!/alreadyowned|alreadyexists/i.test(msg)) {
          return {
            ok: false,
            error: `The bucket was saved here, but creating it in R2 failed: ${msg}. An API token scoped to a single bucket cannot create new ones - create the bucket in Cloudflare, then save again without ticking Create.`,
          };
        }
      }
    }

    // 🟢 Every bucket the Vault touches gets the one day abort rule, not just newly
    // created ones. Best effort and silent: a token without lifecycle permission must
    // not turn a successful save into an error, and the housekeeping panel reports the
    // policy it actually reads back rather than the one we hoped for.
    try {
      const creds = await loadBucketCreds(id);
      const current = await readAbortDays(creds);
      const target = Math.max(1, Math.round(ORPHAN_MAX_AGE_HOURS / 24));
      if (current === null || current > target) await writeAbortDays(creds, target);
    } catch (e) {
      console.error(
        "[vault] could not set the abort rule on save:",
        e instanceof Error ? e.message : String(e),
      );
    }

    revalidatePath("/admin/vault");
    return { ok: true, data: { id } };
  } catch (e) {
    return fail(e, "Couldn't save the bucket.");
  }
}

export async function deleteVaultBucket(bucketId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { _count: { select: { files: true } } },
    });
    if (!row) return { ok: false, error: "That bucket is not in this vault." };
    // 🔴 Refuses while files are listed, rather than cascading. The rows would go; the
    // objects in R2 would not, and the links on live pages would keep working with
    // nothing in the app that knows they exist. Emptying first is the only version of
    // this that leaves a true picture behind.
    if (row._count.files > 0) {
      return {
        ok: false,
        error: `This bucket still lists ${row._count.files} file(s). Delete those first - removing the bucket here would leave the objects in R2 with live links and nothing tracking them.`,
      };
    }
    await prisma.vaultBucket.delete({ where: { id: bucketId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't remove the bucket.");
  }
}

/**
 * Prove a bucket's credentials by writing a tiny object through a presigned PUT and
 * deleting it again.
 *
 * A real round trip, for the same reason the app's own storage test does one: a wrong
 * account id, a token without write permission and a bucket that does not exist are
 * all invisible until something is actually written. Going through the presigned URL
 * rather than the SDK directly also tests the exact path a browser upload will take.
 */
export async function testVaultBucket(bucketId: string): Promise<ActionResult<{ ms: number }>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const started = Date.now();
  try {
    const tenantId = await actingConfigTenantId();
    const owned = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!owned) return { ok: false, error: "That bucket is not in this vault." };

    const creds = await loadBucketCreds(bucketId);
    const key = `v/_healthcheck/${Date.now()}.txt`;
    const url = await presignUpload(creds, key, "text/plain");
    const res = await fetch(url, {
      method: "PUT",
      headers: { "content-type": "text/plain" },
      body: "ok",
    });
    if (!res.ok) {
      return {
        ok: false,
        error: `R2 refused the test upload (HTTP ${res.status}). Check the account id, both keys, and that the bucket name exists.`,
      };
    }
    await deleteObject(creds, key);
    return { ok: true, data: { ms: Date.now() - started } };
  } catch (e) {
    return fail(e, "The bucket test failed.");
  }
}

/* ----------------------------------------------------------------- listing --- */

export async function listVaultFolder(
  bucketId: string,
  folderId: string | null,
): Promise<ActionResult<VaultListingView>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      include: { files: { where: { uploadedAt: { not: null } }, select: { sizeBytes: true } } },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const [folders, files] = await Promise.all([
      prisma.vaultFolder.findMany({
        where: { bucketId, parentId: folderId },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          parentId: true,
          _count: {
            select: {
              // 🔴 FILTERED, and it must stay filtered. The listing below hides rows
              // with no bytes behind them (uploadedAt null = a reservation whose upload
              // never finished), so an unfiltered counter here promises files that
              // opening the folder does not show. That mismatch was reported as
              // "0 folders, 2 files" on a folder that was empty.
              files: { where: { uploadedAt: { not: null } } },
              children: true,
            },
          },
        },
      }),
      prisma.vaultFile.findMany({
        // A pending row has no bytes behind it yet, so it is not a file anyone can use.
        where: { bucketId, folderId, uploadedAt: { not: null } },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          objectKey: true,
          contentType: true,
          sizeBytes: true,
          folderId: true,
          uploadedAt: true,
        },
      }),
    ]);

    // Walk up for the breadcrumb. Bounded, so a cycle introduced by a bad write can
    // never spin here.
    const trail: { id: string; name: string }[] = [];
    let cursor = folderId;
    for (let hops = 0; cursor && hops < 50; hops++) {
      const row: { id: string; name: string; parentId: string | null } | null =
        await prisma.vaultFolder.findFirst({
          where: { id: cursor, bucketId },
          select: { id: true, name: true, parentId: true },
        });
      if (!row) break;
      trail.unshift({ id: row.id, name: row.name });
      cursor = row.parentId;
    }

    const folderViews: VaultFolderView[] = folders.map((f) => ({
      id: f.id,
      name: f.name,
      parentId: f.parentId,
      fileCount: f._count.files,
      folderCount: f._count.children,
    }));
    const fileViews: VaultFileView[] = files.map((f) => ({
      id: f.id,
      name: f.name,
      objectKey: f.objectKey,
      contentType: f.contentType,
      sizeBytes: Number(f.sizeBytes),
      folderId: f.folderId,
      uploadedAt: f.uploadedAt ? f.uploadedAt.toISOString() : null,
      publicUrl: publicUrlFor(bucket.publicBaseUrl, f.objectKey),
    }));

    return {
      ok: true,
      data: {
        bucket: bucketView(bucket),
        trail,
        folderId,
        folders: folderViews,
        files: fileViews,
      },
    };
  } catch (e) {
    return fail(e, "Couldn't open that folder.");
  }
}

/* ----------------------------------------------------------------- folders --- */

export async function createVaultFolder(
  bucketId: string,
  parentId: string | null,
  name: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const clean = safeDisplayName(name);
  if (!clean) return { ok: false, error: "Give the folder a name." };
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    if (parentId) {
      const parent = await prisma.vaultFolder.findFirst({
        where: { id: parentId, bucketId },
        select: { id: true },
      });
      if (!parent) return { ok: false, error: "That parent folder is not in this bucket." };
    }

    // Checked here rather than by a unique constraint: Postgres treats NULLs as
    // distinct, so a constraint on (bucket, parent, name) would not stop two folders
    // sharing a name at the ROOT, which is where it matters most.
    const clash = await prisma.vaultFolder.findFirst({
      where: { bucketId, parentId, name: clean },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `There is already a folder called "${clean}" here.` };

    await prisma.vaultFolder.create({ data: { bucketId, parentId, name: clean, tenantId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't create the folder.");
  }
}

export async function renameVaultFolder(folderId: string, name: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const clean = safeDisplayName(name);
  if (!clean) return { ok: false, error: "Give the folder a name." };
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFolder.findFirst({
      where: { id: folderId, tenantId },
      select: { id: true, bucketId: true, parentId: true },
    });
    if (!row) return { ok: false, error: "That folder is not in this vault." };
    const clash = await prisma.vaultFolder.findFirst({
      where: { bucketId: row.bucketId, parentId: row.parentId, name: clean, id: { not: folderId } },
      select: { id: true },
    });
    if (clash) return { ok: false, error: `There is already a folder called "${clean}" here.` };
    await prisma.vaultFolder.update({ where: { id: folderId }, data: { name: clean } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't rename the folder.");
  }
}

export async function deleteVaultFolder(folderId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFolder.findFirst({
      where: { id: folderId, tenantId },
      select: {
        _count: {
          // Same filter as the listing: a stranded reservation must not make a folder
          // look non-empty and block its deletion. Those rows have folderId set to null
          // by the foreign key when the folder goes.
          select: { files: { where: { uploadedAt: { not: null } } }, children: true },
        },
      },
    });
    if (!row) return { ok: false, error: "That folder is not in this vault." };
    // Same reasoning as the bucket: a cascade here would drop rows and leave the
    // objects in R2 with links still live.
    if (row._count.files > 0 || row._count.children > 0) {
      return { ok: false, error: "Empty the folder first - it still has files or folders in it." };
    }
    await prisma.vaultFolder.delete({ where: { id: folderId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't delete the folder.");
  }
}

/* ------------------------------------------------------------------- files --- */

const ticketInput = z.object({
  bucketId: z.string().min(1),
  folderId: z.string().min(1).nullable(),
  filename: z.string().min(1, "The file has no name.").max(400),
  contentType: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive("That file is empty."),
});

export type VaultTicketInput = z.infer<typeof ticketInput>;

/**
 * Reserve a row and hand back a presigned PUT.
 *
 * 🔴 THE TWO-STEP IS THE POINT. The key has to exist before the signature can be
 * minted, so the row is written first with uploadedAt null - a reservation, not a
 * file. The listing ignores those rows, so a browser that never finishes leaves a
 * harmless orphan rather than a file that appears to exist and 404s when played.
 * confirmVaultUpload is what turns a reservation into a file, and only after HeadObject
 * proves the bytes are really there.
 */
export async function createVaultUploadTicket(
  input: VaultTicketInput,
): Promise<ActionResult<VaultUploadTicket>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;

  const parsed = ticketInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That upload is not valid." };
  }
  const v = parsed.data;

  if (v.sizeBytes > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error:
        "That file is over 5 GB, which is the largest a single upload can be. Split it, or compress it - a VSL at 720p should be a few hundred megabytes at most.",
    };
  }
  if (!ALLOWED_CONTENT_TYPES.includes(v.contentType)) {
    return {
      ok: false,
      error: `${v.contentType} is not an allowed file type here. Video, audio, images, PDFs, Office documents and zips are.`,
    };
  }

  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: v.bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    if (v.folderId) {
      const folder = await prisma.vaultFolder.findFirst({
        where: { id: v.folderId, bucketId: v.bucketId },
        select: { id: true },
      });
      if (!folder) return { ok: false, error: "That folder is not in this bucket." };
    }

    const objectKey = mintObjectKey(v.filename);
    const creds = await loadBucketCreds(v.bucketId);
    const url = await presignUpload(creds, objectKey, v.contentType);

    const row = await prisma.vaultFile.create({
      data: {
        objectKey,
        name: safeDisplayName(v.filename) || "file",
        contentType: v.contentType,
        sizeBytes: BigInt(v.sizeBytes),
        bucketId: v.bucketId,
        folderId: v.folderId,
        tenantId,
        uploadedById: owner.user.id,
        uploadedAt: null,
      },
      select: { id: true },
    });

    return { ok: true, data: { fileId: row.id, url, objectKey } };
  } catch (e) {
    return fail(e, "Couldn't start that upload.");
  }
}

/** Turn a reservation into a real file, but only if the bytes actually arrived. */
export async function confirmVaultUpload(fileId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId },
      select: {
        id: true,
        bucketId: true,
        objectKey: true,
        name: true,
        contentType: true,
        createdAt: true,
      },
    });
    if (!row) return { ok: false, error: "That upload is not in this vault." };

    const creds = await loadBucketCreds(row.bucketId);
    const head = await headObject(creds, row.objectKey);
    if (!head) {
      return {
        ok: false,
        error:
          "R2 has no object at that key, so the upload did not land. If the browser reported a CORS error, the bucket still needs its CORS rule.",
      };
    }
    const finishedAt = new Date();
    await prisma.vaultFile.update({
      where: { id: fileId },
      data: {
        // The real size from R2, not what the browser claimed.
        sizeBytes: BigInt(head.size),
        uploadedAt: finishedAt,
      },
    });
    // Duration measured SERVER-SIDE, from the reservation to the confirmation. That is
    // the real wall clock of the transfer, and it cannot be mis-reported by a browser.
    await logVaultActivity({
      action: "UPLOADED",
      fileId,
      name: row.name,
      sizeBytes: BigInt(head.size),
      contentType: row.contentType,
      objectKey: row.objectKey,
      durationMs: finishedAt.getTime() - row.createdAt.getTime(),
      bucketId: row.bucketId,
      tenantId,
      actorId: owner.user.id,
    });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't confirm that upload.");
  }
}

/**
 * Rename a file. A DATABASE-ONLY change - the object key never moves.
 *
 * This is the payoff of the immutable key: renaming is instant, costs nothing, and
 * cannot break a link already pasted into VidaPulse, an LMS or a landing page.
 */
export async function renameVaultFile(fileId: string, name: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  const clean = safeDisplayName(name);
  if (!clean) return { ok: false, error: "Give the file a name." };
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId },
      select: {
        id: true,
        name: true,
        bucketId: true,
        objectKey: true,
        sizeBytes: true,
        contentType: true,
      },
    });
    if (!row) return { ok: false, error: "That file is not in this vault." };
    await prisma.vaultFile.update({ where: { id: fileId }, data: { name: clean } });
    await logVaultActivity({
      action: "RENAMED",
      fileId,
      name: clean,
      sizeBytes: row.sizeBytes,
      contentType: row.contentType,
      objectKey: row.objectKey,
      detail: `was "${row.name}"`,
      bucketId: row.bucketId,
      tenantId,
      actorId: owner.user.id,
    });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't rename the file.");
  }
}

/**
 * Move a file to another folder in the SAME bucket. Also database-only, so the link
 * survives this too.
 */
export async function moveVaultFile(
  fileId: string,
  folderId: string | null,
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId },
      select: { id: true, bucketId: true },
    });
    if (!row) return { ok: false, error: "That file is not in this vault." };
    if (folderId) {
      const folder = await prisma.vaultFolder.findFirst({
        where: { id: folderId, bucketId: row.bucketId },
        select: { id: true },
      });
      // Crossing buckets by passing a foreign folder id would put a row in a bucket
      // whose credentials cannot read its object. Refused rather than reinterpreted.
      if (!folder) {
        return {
          ok: false,
          error: "That folder is in a different bucket. Use Move to bucket for that.",
        };
      }
    }
    await prisma.vaultFile.update({ where: { id: fileId }, data: { folderId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't move the file.");
  }
}

/**
 * Move a file to a DIFFERENT bucket. The one operation that touches bytes, and the one
 * that changes the public link.
 *
 * Copy, verify, then delete the original - in that order, so a failure anywhere leaves
 * the file still readable at its old link rather than gone from both places.
 *
 * 🟡 Needs an ACCOUNT-SCOPED R2 token: one credential has to read the source and write
 * the destination. With a per-bucket token this fails with AccessDenied, and the error
 * says so instead of leaving the operator to guess.
 */
export async function moveVaultFileToBucket(
  fileId: string,
  targetBucketId: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const file = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId },
      select: { id: true, bucketId: true, objectKey: true },
    });
    if (!file) return { ok: false, error: "That file is not in this vault." };
    if (file.bucketId === targetBucketId) {
      return { ok: false, error: "That file is already in this bucket." };
    }
    const target = await prisma.vaultBucket.findFirst({
      where: { id: targetBucketId, tenantId },
      select: { id: true },
    });
    if (!target) return { ok: false, error: "That bucket is not in this vault." };

    const source = await loadBucketCreds(file.bucketId);
    const dest = await loadBucketCreds(targetBucketId);

    try {
      await copyObjectAcrossBuckets(dest, source.bucketName, file.objectKey);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (/accessdenied|forbidden|403/i.test(msg)) {
        return {
          ok: false,
          error:
            "R2 refused the copy (AccessDenied). A cross-bucket move needs one API token that can read the source bucket and write the destination, so a token scoped to a single bucket cannot do it. Use an account-scoped token on both buckets.",
        };
      }
      throw e;
    }

    // Only trust the copy once the destination confirms the object is there.
    const head = await headObject(dest, file.objectKey);
    if (!head) {
      return {
        ok: false,
        error:
          "The copy reported success but the object is not readable in the destination bucket. Nothing was deleted - the file is still in its original bucket.",
      };
    }

    await prisma.vaultFile.update({
      where: { id: fileId },
      // Lands at the destination root: the folder tree belongs to the old bucket, and
      // silently inventing a matching folder in the new one would be a guess.
      data: { bucketId: targetBucketId, folderId: null },
    });

    // Last, and failure here is logged rather than surfaced: the move has succeeded
    // from the operator's point of view, and a leftover object in the old bucket costs
    // storage but breaks nothing.
    try {
      await deleteObject(source, file.objectKey);
    } catch (e) {
      console.error(
        "[vault] moved but could not delete the source object",
        file.objectKey,
        e instanceof Error ? e.message : String(e),
      );
    }

    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't move the file between buckets.");
  }
}

/**
 * Delete a file: the object first, then the row.
 *
 * That order on purpose. Dropping the row first would leave an object nothing in the
 * app knows about, still answering its public link forever. If the object delete fails
 * the row stays and the operator can try again.
 */
export async function deleteVaultFile(fileId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId },
      select: {
        id: true,
        bucketId: true,
        objectKey: true,
        name: true,
        sizeBytes: true,
        contentType: true,
      },
    });
    if (!row) return { ok: false, error: "That file is not in this vault." };

    const creds = await loadBucketCreds(row.bucketId);
    await deleteObject(creds, row.objectKey);
    await prisma.vaultFile.delete({ where: { id: fileId } });
    // Logged AFTER the delete succeeds, so the log never claims something was removed
    // that is still there. The row keeps the name and size because the file no longer
    // has them.
    await logVaultActivity({
      action: "DELETED",
      fileId: null,
      name: row.name,
      sizeBytes: row.sizeBytes,
      contentType: row.contentType,
      objectKey: row.objectKey,
      bucketId: row.bucketId,
      tenantId,
      actorId: owner.user.id,
    });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't delete the file.");
  }
}

/**
 * Every folder in a bucket as a flat list with a displayable path, for the "move to
 * folder" picker.
 *
 * One query plus an in-memory walk rather than a recursive CTE: a vault's folder tree
 * is tens of rows, not thousands, and the readable version is worth more here than the
 * clever one.
 */
export async function listVaultFolderTree(
  bucketId: string,
): Promise<ActionResult<{ id: string; path: string }[]>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const rows = await prisma.vaultFolder.findMany({
      where: { bucketId },
      select: { id: true, name: true, parentId: true },
      orderBy: { name: "asc" },
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const pathOf = (id: string): string => {
      const parts: string[] = [];
      let cursor: string | null = id;
      for (let hops = 0; cursor && hops < 50; hops++) {
        const row = byId.get(cursor);
        if (!row) break;
        parts.unshift(row.name);
        cursor = row.parentId;
      }
      return parts.join(" / ");
    };
    return {
      ok: true,
      data: rows
        .map((r) => ({ id: r.id, path: pathOf(r.id) }))
        .sort((a, b) => a.path.localeCompare(b.path)),
    };
  } catch (e) {
    return fail(e, "Couldn't load the folder list.");
  }
}

/**
 * Throw away a reservation whose upload failed or was cancelled.
 *
 * Called by the browser the moment a PUT errors or is aborted. Without it every failed
 * attempt leaves a row with no bytes behind it, and those rows were being counted on
 * the folder - a folder reading "2 files" that opens empty.
 *
 * Deliberately refuses to touch a CONFIRMED row: this is cleanup for something that
 * never landed, not a second delete path that skips removing the object.
 */
export async function discardVaultUpload(fileId: string): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId, uploadedAt: null },
      select: { id: true, bucketId: true, objectKey: true },
    });
    // Already confirmed, or not ours: nothing to discard, and saying "ok" keeps a
    // cancel from erroring at the user over a row that is already in the right state.
    if (!row) return { ok: true };

    // A cancelled PUT can still have left a partial or complete object in R2, so the
    // object goes too. Best-effort: the row is the thing that must not survive.
    try {
      const creds = await loadBucketCreds(row.bucketId);
      await deleteObject(creds, row.objectKey);
    } catch {
      // Nothing was there, or R2 is unreachable. Either way the row below is the fix.
    }
    await prisma.vaultFile.delete({ where: { id: fileId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't discard that upload.");
  }
}

/**
 * Delete reservations that can no longer complete.
 *
 * A presigned upload URL lives six hours, so a row still unconfirmed after that can
 * never be finished by anybody - the browser that held the ticket is long gone. Run on
 * the page load that lists buckets, which is cheap and keeps the vault self-healing
 * rather than needing a cron for a handful of rows.
 *
 * Returns how many it removed so a caller can say so; the page ignores it.
 */
export async function sweepVaultPending(): Promise<ActionResult<{ removed: number }>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
    const stale = await prisma.vaultFile.findMany({
      where: { tenantId, uploadedAt: null, createdAt: { lt: cutoff } },
      select: { id: true, bucketId: true, objectKey: true },
    });
    if (stale.length === 0) return { ok: true, data: { removed: 0 } };

    // 🟡 THE OBJECT GOES TOO, and the first version of this got that wrong. It deleted
    // the row and left the bytes, reasoning that deleting an object "by guess" was
    // risky - but there is no guess involved. mintObjectKey() gives every reservation
    // its own random key, used by that upload and nothing else, so an unconfirmed row's
    // key cannot name anybody else's file. A single PUT that reached R2 while its
    // confirm never ran leaves exactly that: a complete, billed, publicly readable
    // object with no row anywhere in the app pointing at it. Dropping the row alone
    // made it permanent and unfindable.
    //
    // Best effort per row: a bucket that is unreachable must not block the sweep, and
    // an object that was never there answers with the same success either way.
    for (const row of stale) {
      try {
        const creds = await loadBucketCreds(row.bucketId);
        await deleteObject(creds, row.objectKey);
      } catch {
        // Unreachable bucket or already gone. The row still goes, below.
      }
    }
    const res = await prisma.vaultFile.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
    return { ok: true, data: { removed: res.count } };
  } catch (e) {
    return fail(e, "Couldn't sweep stale uploads.");
  }
}

/* --------------------------------------------------------------- multipart --- */

/**
 * Begin a multipart upload and reserve the row.
 *
 * The uploadId is handed to the browser rather than stored: it is useless without the
 * presigned part URLs, which only this server can mint, and keeping the flow stateless
 * means a half-finished upload leaves nothing to reconcile beyond the reservation row.
 */
export async function startVaultMultipart(
  input: VaultTicketInput,
): Promise<ActionResult<{ fileId: string; uploadId: string; objectKey: string; partSize: number }>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;

  const parsed = ticketInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That upload is not valid." };
  }
  const v = parsed.data;

  if (v.sizeBytes > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "That file is over the 5 GB limit for a single file." };
  }
  if (!ALLOWED_CONTENT_TYPES.includes(v.contentType)) {
    return { ok: false, error: `${v.contentType} is not an allowed file type here.` };
  }

  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: v.bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };
    if (v.folderId) {
      const folder = await prisma.vaultFolder.findFirst({
        where: { id: v.folderId, bucketId: v.bucketId },
        select: { id: true },
      });
      if (!folder) return { ok: false, error: "That folder is not in this bucket." };
    }

    const objectKey = mintObjectKey(v.filename);
    const creds = await loadBucketCreds(v.bucketId);
    const uploadId = await startMultipart(creds, objectKey, v.contentType);

    const row = await prisma.vaultFile.create({
      data: {
        objectKey,
        name: safeDisplayName(v.filename) || "file",
        contentType: v.contentType,
        sizeBytes: BigInt(v.sizeBytes),
        bucketId: v.bucketId,
        folderId: v.folderId,
        tenantId,
        uploadedById: owner.user.id,
        uploadedAt: null,
      },
      select: { id: true },
    });

    return { ok: true, data: { fileId: row.id, uploadId, objectKey, partSize: PART_SIZE } };
  } catch (e) {
    return fail(e, "Couldn't start that upload.");
  }
}

/** Presign a batch of parts. Called repeatedly as the browser works through the file. */
export async function signVaultParts(
  fileId: string,
  uploadId: string,
  partNumbers: number[],
): Promise<ActionResult<{ partNumber: number; url: string }[]>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  // A bound on the batch so one call cannot be turned into thousands of signatures.
  if (partNumbers.length === 0 || partNumbers.length > 64) {
    return { ok: false, error: "Ask for between 1 and 64 parts at a time." };
  }
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId, uploadedAt: null },
      select: { bucketId: true, objectKey: true },
    });
    if (!row) return { ok: false, error: "That upload is no longer open." };
    const creds = await loadBucketCreds(row.bucketId);
    const urls = await presignParts(creds, row.objectKey, uploadId, partNumbers);
    return { ok: true, data: urls };
  } catch (e) {
    return fail(e, "Couldn't prepare the next parts.");
  }
}

/** Stitch the parts together, verify the result, and mark the file real. */
export async function completeVaultMultipart(
  fileId: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[],
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  if (parts.length === 0) return { ok: false, error: "No parts were uploaded." };
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId, uploadedAt: null },
      select: {
        id: true,
        bucketId: true,
        objectKey: true,
        name: true,
        contentType: true,
        createdAt: true,
      },
    });
    if (!row) return { ok: false, error: "That upload is no longer open." };

    const creds = await loadBucketCreds(row.bucketId);
    await completeMultipart(creds, row.objectKey, uploadId, parts);

    // Same rule as the single-PUT path: the row becomes a file only once R2 confirms
    // the object is readable, and the size recorded is R2's, not the browser's claim.
    const head = await headObject(creds, row.objectKey);
    if (!head) {
      return {
        ok: false,
        error: "R2 reported the upload complete but the object is not readable. Nothing was saved.",
      };
    }
    const finishedAt = new Date();
    await prisma.vaultFile.update({
      where: { id: fileId },
      data: { sizeBytes: BigInt(head.size), uploadedAt: finishedAt },
    });
    await logVaultActivity({
      action: "UPLOADED",
      fileId,
      name: row.name,
      sizeBytes: BigInt(head.size),
      contentType: row.contentType,
      objectKey: row.objectKey,
      durationMs: finishedAt.getTime() - row.createdAt.getTime(),
      detail: `${parts.length} parts`,
      bucketId: row.bucketId,
      tenantId,
      actorId: owner.user.id,
    });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't finish that upload.");
  }
}

/**
 * Abandon a multipart upload and remove its reservation.
 *
 * 🟡 Aborting at R2 matters for money, not tidiness: the parts of an incomplete
 * multipart upload are billed as storage and do not appear in the bucket listing, so an
 * upload that is cancelled and never aborted is invisible storage paid for forever.
 */
export async function abortVaultMultipart(
  fileId: string,
  uploadId: string,
): Promise<ActionResult> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const row = await prisma.vaultFile.findFirst({
      where: { id: fileId, tenantId, uploadedAt: null },
      select: { id: true, bucketId: true, objectKey: true },
    });
    if (!row) return { ok: true };
    try {
      const creds = await loadBucketCreds(row.bucketId);
      await abortMultipart(creds, row.objectKey, uploadId);
    } catch (e) {
      console.error("[vault] could not abort multipart", e instanceof Error ? e.message : String(e));
    }
    await prisma.vaultFile.delete({ where: { id: fileId } });
    revalidatePath("/admin/vault");
    return { ok: true };
  } catch (e) {
    return fail(e, "Couldn't abandon that upload.");
  }
}

/** Where the browser switches from one PUT to many parts. */
export async function vaultMultipartThreshold(): Promise<ActionResult<{ threshold: number }>> {
  await requireSuperAdmin();
  return { ok: true, data: { threshold: MULTIPART_THRESHOLD } };
}

/* ---------------------------------------------------------------- activity --- */

/**
 * Record what happened, in a table that outlives the file.
 *
 * Best-effort on purpose: a log that cannot be written must never fail the upload or
 * the delete it was describing. A missing row is a gap in a report; a thrown error here
 * would be a file the operator believes is gone and is not, or vice versa.
 */
async function logVaultActivity(entry: {
  action: "UPLOADED" | "DELETED" | "RENAMED" | "MOVED" | "ABORTED";
  fileId: string | null;
  name: string;
  sizeBytes: bigint;
  contentType: string;
  objectKey: string;
  durationMs?: number | null;
  detail?: string | null;
  bucketId: string;
  tenantId: string;
  actorId: string;
}): Promise<void> {
  try {
    await prisma.vaultActivity.create({
      data: {
        action: entry.action,
        fileId: entry.fileId,
        name: entry.name,
        sizeBytes: entry.sizeBytes,
        contentType: entry.contentType,
        objectKey: entry.objectKey,
        durationMs: entry.durationMs ?? null,
        detail: entry.detail ?? null,
        bucketId: entry.bucketId,
        tenantId: entry.tenantId,
        actorId: entry.actorId,
      },
    });
  } catch (e) {
    console.error("[vault] activity log failed:", e instanceof Error ? e.message : String(e));
  }
}

export interface VaultActivityRow {
  id: string;
  action: "UPLOADED" | "DELETED" | "RENAMED" | "MOVED" | "ABORTED";
  name: string;
  sizeBytes: number;
  contentType: string;
  /** Milliseconds the upload took, or null for anything that is not an upload. */
  durationMs: number | null;
  detail: string | null;
  /** ISO; the client formats it, so the format rule lives in one place. */
  at: string;
  /** Null once the file has been deleted, which is the point of keeping the row. */
  fileId: string | null;
  stillExists: boolean;
}

/** The log for a bucket, newest first. */
export async function listVaultActivity(
  bucketId: string,
  limit = 100,
): Promise<ActionResult<VaultActivityRow[]>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const rows = await prisma.vaultActivity.findMany({
      where: { bucketId },
      orderBy: { at: "desc" },
      take: Math.min(Math.max(limit, 1), 500),
    });

    // Which of the logged files are still around, so the log can mark the ones that
    // are gone. One query rather than one per row.
    const ids = rows.map((r) => r.fileId).filter((id): id is string => !!id);
    const alive = new Set(
      ids.length
        ? (
            await prisma.vaultFile.findMany({
              where: { id: { in: ids }, uploadedAt: { not: null } },
              select: { id: true },
            })
          ).map((f) => f.id)
        : [],
    );

    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        action: r.action,
        name: r.name,
        sizeBytes: Number(r.sizeBytes),
        contentType: r.contentType,
        durationMs: r.durationMs,
        detail: r.detail,
        at: r.at.toISOString(),
        fileId: r.fileId,
        stillExists: !!r.fileId && alive.has(r.fileId),
      })),
    };
  } catch (e) {
    return fail(e, "Couldn't load the activity log.");
  }
}

/* ------------------------------------------------- orphaned part cleanup --- */

/**
 * What is stranded in the bucket, and what R2's own policy will do about it.
 *
 * 🔴 WHY THIS SCREEN EXISTS AT ALL. An incomplete multipart upload is parts R2 stores
 * and bills while they belong to no object. They appear in no file listing - not in the
 * Cloudflare browser, not in this Vault - so without asking for them by name there is
 * no way to know they are there. They are created by any upload that dies after parts
 * have gone up but before the abort runs: a closed tab, a crashed page, a deploy
 * restarting the app mid upload. The browser's abort is best effort by nature, because
 * the code that would send it is the code that just stopped.
 *
 * Read only, and deliberately separate from the cleanup below, so the owner sees the
 * number before anything is destroyed.
 */
export async function vaultOrphanStatus(
  bucketId: string,
): Promise<ActionResult<VaultOrphanStatus>> {
  await requireSuperAdmin();
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const creds = await loadBucketCreds(bucketId);
    const incomplete = await listIncompleteUploads(creds);
    const now = Date.now();
    const rows: VaultOrphanRow[] = incomplete
      .map((u) => ({
        objectKey: u.objectKey,
        uploadId: u.uploadId,
        initiatedAt: u.initiatedAt ? u.initiatedAt.toISOString() : null,
        ageHours: u.initiatedAt
          ? Math.round(((now - u.initiatedAt.getTime()) / 3_600_000) * 10) / 10
          : null,
      }))
      .sort((a, b) => (b.ageHours ?? -1) - (a.ageHours ?? -1));

    // Reading the lifecycle rule needs a broader permission than listing does, so it is
    // allowed to fail on its own without taking the listing down with it. Cleanup still
    // works without it; only the permanent guarantee is out of reach.
    let abortDays: number | null = null;
    let policyError: string | null = null;
    try {
      abortDays = await readAbortDays(creds);
    } catch (e) {
      policyError = e instanceof Error ? e.message : String(e);
    }

    return {
      ok: true,
      data: {
        abortDays,
        defaultDays: R2_DEFAULT_ABORT_DAYS,
        policyTight: abortDays !== null && abortDays * 24 <= ORPHAN_MAX_AGE_HOURS,
        rows,
        cleanable: rows.filter((r) => r.ageHours !== null && r.ageHours >= ORPHAN_MAX_AGE_HOURS)
          .length,
        policyError,
      },
    };
  } catch (e) {
    return fail(e, "Couldn't read the bucket's incomplete uploads.");
  }
}

/**
 * Abort every incomplete upload older than ORPHAN_MAX_AGE_HOURS.
 *
 * 🔴 THE AGE TEST IS THE WHOLE SAFETY ARGUMENT. Cleanup cannot tell a dead upload from
 * a slow one - it can only tell an old one from a new one. Aborting a live upload
 * destroys it from under the person watching the progress bar, and they would see the
 * same opaque failure the checksum bug produced. A presigned part URL lives six hours,
 * so at twenty four nothing legitimate is still running. verify:vault holds the floor.
 *
 * An upload R2 reports with no initiation time is skipped rather than guessed about.
 */
export async function cleanVaultOrphans(
  bucketId: string,
): Promise<ActionResult<{ aborted: number; skipped: number; failed: number }>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const creds = await loadBucketCreds(bucketId);
    const incomplete = await listIncompleteUploads(creds);
    const cutoff = Date.now() - ORPHAN_MAX_AGE_HOURS * 60 * 60 * 1000;

    let aborted = 0;
    let skipped = 0;
    let failed = 0;
    for (const u of incomplete) {
      if (!u.initiatedAt || u.initiatedAt.getTime() > cutoff) {
        skipped++;
        continue;
      }
      try {
        await abortMultipart(creds, u.objectKey, u.uploadId);
        aborted++;
        const ageHours = Math.round((Date.now() - u.initiatedAt.getTime()) / 3_600_000);
        // Logged so the one cost nobody can see leaves a trace that it stopped. Size is
        // zero because ListMultipartUploads does not report the bytes already uploaded,
        // and an invented number in a log is worse than none.
        await logVaultActivity({
          action: "ABORTED",
          fileId: null,
          name: u.objectKey.split("/").pop() ?? u.objectKey,
          sizeBytes: 0n,
          contentType: "",
          objectKey: u.objectKey,
          detail: `incomplete upload aborted, started ${ageHours} h earlier`,
          bucketId,
          tenantId,
          actorId: owner.user.id,
        });
      } catch {
        // One stubborn upload must not stop the rest. It stays listed, and R2's own
        // lifecycle rule will take it.
        failed++;
      }
    }
    if (aborted > 0) revalidatePath("/admin/vault");
    return { ok: true, data: { aborted, skipped, failed } };
  } catch (e) {
    return fail(e, "Couldn't clean up the incomplete uploads.");
  }
}

/**
 * Put R2's own lifecycle rule in charge of this, permanently.
 *
 * 🟢 THIS IS THE REAL FIX, and the cleanup above is only the convenience. R2 aborts
 * incomplete uploads itself, server side, on a bucket rule: no cron, no Worker, no
 * browser, nothing in this app that has to still be running. It keeps working when the
 * app is down, when the tab is closed, and when nobody opens the Vault for a month -
 * which is exactly the condition under which stranded parts accumulate unnoticed.
 *
 * Every bucket already has an implicit seven day default. This tightens it to one day,
 * the floor R2's rules allow.
 */
export async function applyVaultOrphanPolicy(
  bucketId: string,
): Promise<ActionResult<{ days: number }>> {
  const owner = await requireOwner();
  if (!owner.ok) return owner;
  try {
    const tenantId = await actingConfigTenantId();
    const bucket = await prisma.vaultBucket.findFirst({
      where: { id: bucketId, tenantId },
      select: { id: true },
    });
    if (!bucket) return { ok: false, error: "That bucket is not in this vault." };

    const creds = await loadBucketCreds(bucketId);
    // A day is the finest grain an R2 lifecycle rule takes, and it matches the Vault's
    // own cutoff. Rounding up rather than to zero: a rule of zero days is not a rule.
    const days = Math.max(1, Math.round(ORPHAN_MAX_AGE_HOURS / 24));
    await writeAbortDays(creds, days);
    return { ok: true, data: { days } };
  } catch (e) {
    return fail(e, "Couldn't set the bucket's cleanup rule.");
  }
}

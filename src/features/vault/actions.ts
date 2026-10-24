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
  type VaultUploadTicket,
} from "./types";
import { mintObjectKey, publicUrlFor, safeDisplayName } from "./keys";
import {
  copyObjectAcrossBuckets,
  createRemoteBucket,
  deleteObject,
  headObject,
  loadBucketCreds,
  presignUpload,
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
        await createRemoteBucket(creds);
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
          _count: { select: { files: true, children: true } },
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
      select: { _count: { select: { files: true, children: true } } },
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
      select: { id: true, bucketId: true, objectKey: true },
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
    await prisma.vaultFile.update({
      where: { id: fileId },
      data: {
        // The real size from R2, not what the browser claimed.
        sizeBytes: BigInt(head.size),
        uploadedAt: new Date(),
      },
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
      select: { id: true },
    });
    if (!row) return { ok: false, error: "That file is not in this vault." };
    await prisma.vaultFile.update({ where: { id: fileId }, data: { name: clean } });
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
      select: { id: true, bucketId: true, objectKey: true },
    });
    if (!row) return { ok: false, error: "That file is not in this vault." };

    const creds = await loadBucketCreds(row.bucketId);
    await deleteObject(creds, row.objectKey);
    await prisma.vaultFile.delete({ where: { id: fileId } });
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

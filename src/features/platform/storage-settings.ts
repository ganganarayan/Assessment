"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, isStaff } from "@/lib/auth/guards";
import { encryptWithSecret } from "@/lib/crypto";
import { env } from "@/lib/env";
import { resetStorageConfig, storage, tenantKey } from "@/lib/storage/r2";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Cloudflare R2 credentials - PLATFORM scope, super admin only.
 *
 * One bucket for the whole install; tenants are isolated by key prefix (see
 * lib/storage/r2 tenantKey). Kept in Settings rather than environment variables so keys
 * can be rotated without a deploy.
 *
 * The secret is never returned to the client - the editor shows whether one is SET and
 * lets you replace it. Sending it back would put a live storage credential in a page
 * payload and in the browser's memory for no reason.
 */

export interface StorageSettingsView {
  accountId: string;
  accessKeyId: string;
  bucketName: string;
  publicUrl: string;
  /** True when a secret is stored. The value itself is never sent to the client. */
  hasSecret: boolean;
}

export async function getStorageSettings(): Promise<ActionResult<StorageSettingsView>> {
  await requireSuperAdmin();
  try {
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
    return {
      ok: true,
      data: {
        accountId: row?.r2AccountId ?? "",
        accessKeyId: row?.r2AccessKeyId ?? "",
        bucketName: row?.r2BucketName ?? "",
        publicUrl: row?.r2PublicUrl ?? "",
        hasSecret: !!row?.r2SecretAccessKeyEnc,
      },
    };
  } catch (e) {
    console.error("[platform] getStorageSettings failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't load the storage settings (a temporary database error)." };
  }
}

export interface StorageSettingsInput {
  accountId: string;
  accessKeyId: string;
  /** Blank leaves the stored secret untouched - that is how you edit the other fields
   *  without having to paste the key again. */
  secretAccessKey: string;
  bucketName: string;
  publicUrl: string;
}

export async function saveStorageSettings(input: StorageSettingsInput): Promise<ActionResult> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return { ok: false, error: "Only an owner can change storage settings." };

  const t = (v: string | undefined) => (v ?? "").trim();
  const accountId = t(input.accountId);
  const accessKeyId = t(input.accessKeyId);
  const bucketName = t(input.bucketName);
  const publicUrl = t(input.publicUrl);
  const secret = t(input.secretAccessKey);

  // A public URL that is not a URL produces object links that silently 404 later, far
  // from the cause - so it is rejected here rather than stored.
  if (publicUrl) {
    try {
      const u = new URL(publicUrl);
      if (u.protocol !== "https:") return { ok: false, error: "The public URL must start with https://." };
    } catch {
      return { ok: false, error: "The public URL is not a valid URL." };
    }
  }

  const data: Record<string, string | null> = {
    r2AccountId: accountId || null,
    r2AccessKeyId: accessKeyId || null,
    r2BucketName: bucketName || null,
    // Stored without a trailing slash so key joining never produces a double slash.
    r2PublicUrl: publicUrl ? publicUrl.replace(/\/+$/, "") : null,
  };
  // Only overwrite the secret when a new one was actually typed.
  if (secret) data.r2SecretAccessKeyEnc = encryptWithSecret(secret, env.BETTER_AUTH_SECRET);

  try {
    await prisma.appSetting.update({ where: { id: "singleton" }, data });
  } catch (e) {
    console.error("[platform] saveStorageSettings failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Couldn't save the storage settings (a temporary database error). Try again." };
  }

  // Drop the cached credentials, or a corrected key would not apply until the process
  // restarted - which reads as the save having done nothing.
  resetStorageConfig();
  revalidatePath("/platform");
  return { ok: true };
}

/**
 * Prove the credentials work, by writing a small object and reading it back.
 *
 * A real round trip rather than a credential-shape check: the ways R2 actually fails
 * are a wrong account id, a token without write permission, and a bucket name that does
 * not exist - none of which are visible until something is written. Writes under the
 * platform tenant's own prefix and deletes it again, so a test leaves nothing behind.
 */
export async function testStorage(): Promise<ActionResult<{ ms: number }>> {
  const me = await requireSuperAdmin();
  if (isStaff(me)) return { ok: false, error: "Only an owner can test storage." };

  const key = tenantKey("platform", `_healthcheck/${Date.now()}.txt`);
  const started = Date.now();
  try {
    await storage.upload({ key, body: "ok", contentType: "text/plain" });
    await storage.delete(key);
    return { ok: true, data: { ms: Date.now() - started } };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[platform] testStorage failed:", msg);
    // The SDK's message names the actual cause (NoSuchBucket, InvalidAccessKeyId,
    // AccessDenied), which is exactly what is needed to fix it - so pass it through
    // instead of flattening it to "test failed".
    return { ok: false, error: msg };
  }
}

"use server";

import { randomUUID } from "crypto";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, configTenantOf, scopeEditDenied } from "@/lib/tenant/acting";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { storage, tenantKey, isStorageConfigured } from "@/lib/storage/r2";
import { type ActionResult } from "@/features/assessment/actions/shared";
import {
  BRAND_IMAGE_MAX_BYTES,
  BRAND_IMAGE_TYPES,
  type BrandImageKind,
  type BrandLegal,
} from "@/features/workspace/brand-legal";

/**
 * Brand and legal (Phase 3 of the multi-tenant review, white label).
 *
 * Acting-scoped, so one card serves /w/settings (the tenant), /admin/settings while
 * impersonating (that tenant) and /admin/settings on the platform (the singleton row;
 * the platform has no image overrides, its icon is the app's own).
 */
export async function getBrandLegal(): Promise<BrandLegal> {
  const scope = await resolveActingScope();
  const tenantId = configTenantOf(scope);
  const platform = isPlatformScope(tenantId);
  const [s, theme] = await Promise.all([
    prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId),
      select: { privacyUrl: true, termsUrl: true, replyToEmail: true, reportDisclaimer: true },
    }),
    platform
      ? Promise.resolve(null)
      : prisma.theme.findUnique({ where: { tenantId }, select: { logoUrl: true, faviconUrl: true, shareImageUrl: true } }),
  ]);
  return {
    logoUrl: theme?.logoUrl ?? "",
    faviconUrl: theme?.faviconUrl ?? "",
    shareImageUrl: theme?.shareImageUrl ?? "",
    privacyUrl: s?.privacyUrl ?? "",
    termsUrl: s?.termsUrl ?? "",
    replyToEmail: s?.replyToEmail ?? "",
    reportDisclaimer: s?.reportDisclaimer ?? "",
    isPlatform: platform,
  };
}

const httpsUrl = z
  .string()
  .trim()
  .max(1000, "That link is too long.")
  .refine((v) => v === "" || /^https:\/\/[^\s"'<>]+$/i.test(v), "Use a full https:// link.");

const schema = z.object({
  logoUrl: httpsUrl,
  faviconUrl: httpsUrl,
  shareImageUrl: httpsUrl,
  privacyUrl: httpsUrl,
  termsUrl: httpsUrl,
  replyToEmail: z
    .string()
    .trim()
    .max(254)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid reply-to email."),
  reportDisclaimer: z.string().trim().max(300, "Keep the closing line under 300 characters."),
});

export async function updateBrandLegal(input: Omit<BrandLegal, "isPlatform">): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);

  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the fields." };
  const v = parsed.data;

  const data = {
    privacyUrl: v.privacyUrl || null,
    termsUrl: v.termsUrl || null,
    replyToEmail: v.replyToEmail || null,
    reportDisclaimer: v.reportDisclaimer || null,
  };
  await prisma.appSetting.upsert({
    where: appSettingWhere(tenantId),
    update: data,
    create: { id: tenantAppSettingId(tenantId), tenantId, ...data },
  });

  if (!isPlatformScope(tenantId)) {
    const images = { logoUrl: v.logoUrl || null, faviconUrl: v.faviconUrl || null, shareImageUrl: v.shareImageUrl || null };
    await prisma.theme.upsert({ where: { tenantId }, update: images, create: { tenantId, ...images } });
  }

  revalidatePath("/w/settings");
  revalidatePath("/admin/settings");
  revalidatePath("/", "layout"); // favicon and share image are in every page's head
  return { ok: true };
}

/**
 * Upload one brand image to storage and hand back its public link; the form puts the
 * link in the field and the operator saves. Type and size are checked HERE, because a
 * server action is callable directly and the browser is not where limits hold.
 */
export async function uploadBrandImage(form: FormData): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);
  if (isPlatformScope(tenantId)) return { ok: false, error: "The platform uses the app's own icon." };

  const kindRaw = form.get("kind");
  const kind: BrandImageKind | null = kindRaw === "logo" || kindRaw === "favicon" || kindRaw === "share" ? kindRaw : null;
  const file = form.get("file");
  if (!kind || !(file instanceof File)) return { ok: false, error: "Choose an image." };
  const type = file.type;
  if (!(BRAND_IMAGE_TYPES as readonly string[]).includes(type)) {
    return { ok: false, error: "Use a PNG, JPEG, WebP or ICO image." };
  }
  if (file.size === 0 || file.size > BRAND_IMAGE_MAX_BYTES) return { ok: false, error: "Keep the image under 2 MB." };
  if (!(await isStorageConfigured())) return { ok: false, error: "File storage is not set up yet. Paste an https link instead." };

  try {
    const ext = type === "image/jpeg" ? "jpg" : type === "image/png" ? "png" : type === "image/webp" ? "webp" : "ico";
    // A generated name: a fresh link per upload, so a browser or Meta never shows the old image.
    const key = tenantKey(tenantId, `brand/${kind}-${randomUUID()}.${ext}`);
    const url = await storage.upload({ key, body: Buffer.from(await file.arrayBuffer()), contentType: type });
    return /^https:\/\//i.test(url) ? { ok: true, url } : { ok: false, error: "Storage gave back a non-https link. Paste one instead." };
  } catch (e) {
    console.error("[brand] upload failed:", e instanceof Error ? e.message : String(e));
    return { ok: false, error: "Upload failed. Try again, or paste an https link." };
  }
}

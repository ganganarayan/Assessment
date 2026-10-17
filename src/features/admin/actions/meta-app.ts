"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin, editDenied } from "@/lib/auth/guards";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { type MetaAppSettingsView } from "@/features/whatsapp/types";

/**
 * THE Meta developer app, edited by the platform owner and nobody else.
 *
 * One app serves every tenant: that is what Meta calls a Tech Provider, and it is why
 * a tenant connecting WhatsApp never creates an app, never generates a token, and
 * never needs a second admin in their own business to approve anything.
 *
 * Singleton row only, deliberately not env vars: the app can be re-created and the
 * secret rotated, and neither should need a redeploy to take effect.
 */

const enc = (v: string) => encryptWithSecret(v.trim(), env.BETTER_AUTH_SECRET);

export async function getMetaAppSettings(): Promise<MetaAppSettingsView> {
  await requireSuperAdmin();
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: { metaAppId: true, metaAppSecretEnc: true, metaEsConfigId: true, metaWebhookVerifyTokenEnc: true },
  });
  return {
    appId: s?.metaAppId ?? "",
    hasSecret: !!s?.metaAppSecretEnc,
    configId: s?.metaEsConfigId ?? "",
    hasVerifyToken: !!s?.metaWebhookVerifyTokenEnc,
    webhookUrl: env.NEXT_PUBLIC_APP_URL + "/api/hooks/whatsapp",
    graphVersion: env.META_GRAPH_API_VERSION,
  };
}

/**
 * Save the app details.
 *
 * Both secrets are write-only: a blank field KEEPS what is stored, which is what makes
 * the form safe to re-submit when only the configuration id changed. Clearing a secret
 * on purpose is done by clearing the app id, which switches the whole feature off, and
 * that is the honest lever - a config id with no secret behind it is a button that
 * opens a popup and then fails.
 */
export async function updateMetaAppSettings(input: {
  appId: string;
  appSecret: string;
  configId: string;
  verifyToken: string;
}): Promise<ActionResult> {
  const denied = editDenied(await requireSuperAdmin());
  if (denied) return denied;

  const appId = input.appId.trim();
  const configId = input.configId.trim();
  // Meta ids are numeric strings. Catching a pasted URL or a stray quote here saves a
  // confusing popup failure later, in somebody else's browser.
  if (appId && !/^\d{5,25}$/.test(appId)) {
    return { ok: false, error: "The app id should be just the number from the App Dashboard." };
  }
  if (configId && !/^\d{5,25}$/.test(configId)) {
    return { ok: false, error: "The configuration id should be just the number from Facebook Login for Business." };
  }

  const data: {
    metaAppId: string | null;
    metaEsConfigId: string | null;
    metaAppSecretEnc?: string;
    metaWebhookVerifyTokenEnc?: string;
  } = {
    metaAppId: appId || null,
    metaEsConfigId: configId || null,
  };
  if (input.appSecret.trim()) data.metaAppSecretEnc = enc(input.appSecret);
  if (input.verifyToken.trim()) data.metaWebhookVerifyTokenEnc = enc(input.verifyToken);

  await prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: data,
    create: { id: "singleton", ...data },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/w/settings");
  return { ok: true };
}

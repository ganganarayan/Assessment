"use server";

import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { decryptWithSecret, encryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeOwnerDenied, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { audit } from "@/lib/audit/log";
import {
  SCOPED_SECRETS,
  PLATFORM_SECRETS,
  type ScopedSecret,
  type PlatformSecret,
  type SecretName,
  type SecretResult,
  type WebhookAccount,
} from "@/features/secrets/names";

/**
 * Copy one stored secret to the caller's clipboard WITHOUT the page ever holding it.
 *
 * The settings screens are write-only on purpose: a saved key is shown as "(saved)"
 * and dots, never echoed back into the HTML. This is the one read path, and it only
 * runs on a deliberate click. The value travels in this action's response straight
 * into navigator.clipboard; it is never placed in the DOM, an input, a data
 * attribute or page props.
 *
 * Who may copy what:
 *  - Staff of any permission: nothing. Copying a key is handing it out, which is an
 *    owner decision, the same rule as minting API tokens.
 *  - Platform-only secrets and vault buckets: super admin only, from the platform row.
 *  - Workspace secrets: the caller's OWN config row (configTenantOf), so a tenant can
 *    only ever reach its own row and a super admin reaches the workspace they entered,
 *    or the platform row when they entered none. Exactly the row the screen edits.
 *  - Ad account token: the account must belong to that same config tenant.
 */

const SCOPED_COLUMN: Record<ScopedSecret, keyof Prisma.AppSettingSelect> = {
  metaCapiToken: "metaCapiTokenEnc",
  razorpayKeySecret: "razorpayKeySecretEnc",
  razorpayWebhookSecret: "razorpayWebhookSecretEnc",
  razorpayNonGstKeySecret: "razorpayNonGstKeySecretEnc",
  razorpayNonGstWebhookSecret: "razorpayNonGstWebhookSecretEnc",
  emailApiKey: "emailApiKeyEnc",
  smtpPass: "smtpPassEnc",
  wabaAccessToken: "wabaAccessTokenEnc",
  aiClaudeKey: "aiClaudeKeyEnc",
  aiOpenAiKey: "aiOpenAiKeyEnc",
  aiGeminiKey: "aiGeminiKeyEnc",
};

const PLATFORM_COLUMN: Record<PlatformSecret, keyof Prisma.AppSettingSelect> = {
  platformCapiToken: "platformCapiTokenEnc",
  metaAppSecret: "metaAppSecretEnc",
  metaWebhookVerifyToken: "metaWebhookVerifyTokenEnc",
  aiClaudeAdminKey: "aiClaudeAdminKeyEnc",
  aiOpenAiAdminKey: "aiOpenAiAdminKeyEnc",
  r2SecretAccessKey: "r2SecretAccessKeyEnc",
  googleClientSecret: "googleClientSecretEnc",
  zoomClientSecret: "zoomClientSecretEnc",
};

/** The AI provider each per-provider key belongs to, for the legacy single-key fallback. */
const AI_PROVIDER_OF: Partial<Record<ScopedSecret, string>> = {
  aiClaudeKey: "claude",
  aiOpenAiKey: "openai",
  aiGeminiKey: "gemini",
};

const NOTHING = "Nothing is saved here to copy.";

function isScoped(n: string): n is ScopedSecret {
  return (SCOPED_SECRETS as readonly string[]).includes(n);
}
function isPlatform(n: string): n is PlatformSecret {
  return (PLATFORM_SECRETS as readonly string[]).includes(n);
}

function readColumn(row: Record<string, unknown> | null, col: string): string | null {
  const v = row?.[col];
  return typeof v === "string" && v ? v : null;
}

export async function copyStoredSecret(name: SecretName, recordId?: string): Promise<SecretResult> {
  const scope = await resolveActingScope();
  const denied = scopeOwnerDenied(scope);
  if (denied) return denied;

  let enc: string | null = null;
  let tenantId: string | null = null;

  if (isPlatform(name)) {
    if (!scope.isSuper) return { ok: false, error: "Super admin only." };
    const col = PLATFORM_COLUMN[name];
    const row = await prisma.appSetting.findUnique({ where: { id: "singleton" }, select: { [col]: true } });
    enc = readColumn(row as Record<string, unknown> | null, col);
  } else if (isScoped(name)) {
    tenantId = configTenantOf(scope);
    const col = SCOPED_COLUMN[name];
    const row = (await prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: { [col]: true, aiApiKeyEnc: true, aiProvider: true },
    })) as Record<string, unknown> | null;
    enc = readColumn(row, col);
    // A workspace screen shows the DEFAULT ad account's token as its Meta token, so
    // copy that one, falling back to the legacy column only when there is no account.
    if (name === "metaCapiToken" && !isPlatformScope(tenantId)) {
      const account = await prisma.adAccount.findFirst({
        where: { tenantId, isDefault: true },
        select: { capiTokenEnc: true },
      });
      if (account) enc = account.capiTokenEnc;
    }
    // Pre-migration configs kept one key for whichever provider was active.
    const provider = AI_PROVIDER_OF[name];
    if (!enc && provider && row?.aiProvider === provider) enc = readColumn(row, "aiApiKeyEnc");
  } else if (name === "adAccountCapiToken") {
    if (!recordId) return { ok: false, error: NOTHING };
    tenantId = configTenantOf(scope);
    const account = await prisma.adAccount.findFirst({
      where: { id: recordId, tenantId },
      select: { capiTokenEnc: true },
    });
    enc = account?.capiTokenEnc ?? null;
  } else if (name === "vaultBucketSecret") {
    if (!scope.isSuper) return { ok: false, error: "Super admin only." };
    if (!recordId) return { ok: false, error: NOTHING };
    const bucket = await prisma.vaultBucket.findUnique({
      where: { id: recordId },
      select: { secretAccessKeyEnc: true },
    });
    enc = bucket?.secretAccessKeyEnc ?? null;
  } else {
    return { ok: false, error: "Unknown secret." };
  }

  if (!enc) return { ok: false, error: NOTHING };
  const value = decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
  if (!value) return { ok: false, error: "The saved value could not be read. Paste it again to replace it." };

  // Who copied which key, never the key itself.
  await audit({
    actor: { id: scope.user.id, email: scope.user.email },
    action: "secret.copy",
    tenantId: tenantId ?? configTenantOf(scope),
    targetType: "secret",
    targetId: recordId ? `${name}:${recordId}` : name,
    summary: `Copied the saved ${name} to the clipboard`,
  });

  return { ok: true, value };
}

/**
 * Make a NEW Razorpay webhook secret for one account, save it over the old one, and
 * hand it back once so the button can put it on the clipboard. The old secret is gone
 * the moment this returns, so Razorpay's webhooks fail their signature check until the
 * new value is pasted into Razorpay → Settings → Webhooks. The button warns before it
 * runs when a secret is already saved. If the clipboard write fails, the Copy button
 * beside it still reads the new one.
 *
 * Same scope and owner rule as copyStoredSecret: the caller's own config row only.
 */
export async function regenerateWebhookSecret(account: WebhookAccount): Promise<SecretResult> {
  if (account !== "gst" && account !== "nonGst") return { ok: false, error: "Unknown account." };
  const scope = await resolveActingScope();
  const denied = scopeOwnerDenied(scope) ?? scopeEditDenied(scope);
  if (denied) return denied;

  const tenantId = configTenantOf(scope);
  const value = randomBytes(24).toString("base64url");
  const enc = encryptWithSecret(value, env.BETTER_AUTH_SECRET);
  const data =
    account === "gst" ? { razorpayWebhookSecretEnc: enc } : { razorpayNonGstWebhookSecretEnc: enc };

  // The platform row is created bare, exactly as the platform save actions do.
  await prisma.appSetting.upsert({
    where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
    update: data,
    create: isPlatformScope(tenantId)
      ? { id: "singleton", ...data }
      : { id: tenantAppSettingId(tenantId), tenantId, ...data },
  });

  await audit({
    actor: { id: scope.user.id, email: scope.user.email },
    action: "secret.regenerate",
    tenantId,
    targetType: "secret",
    targetId: account === "gst" ? "razorpayWebhookSecret" : "razorpayNonGstWebhookSecret",
    summary: `Generated a new ${account === "gst" ? "GST" : "non-GST"} Razorpay webhook secret`,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/w/settings");
  return { ok: true, value };
}

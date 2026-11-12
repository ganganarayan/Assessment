"use server";

import { type Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeOwnerDenied, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { audit } from "@/lib/audit/log";
import {
  SCOPED_SECRETS,
  PLATFORM_SECRETS,
  type ScopedSecret,
  type PlatformSecret,
  type SecretName,
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

type CopyResult = { ok: true; value: string } | { ok: false; error: string };

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

export async function copyStoredSecret(name: SecretName, recordId?: string): Promise<CopyResult> {
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

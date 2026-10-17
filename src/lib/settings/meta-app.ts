import "server-only";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";

/**
 * THE Meta developer app, read from the singleton AppSetting row.
 *
 * There is exactly one, ours, and every tenant connects their own WhatsApp account
 * THROUGH it. That is what Meta calls a Tech Provider, and it is the reason a tenant
 * never has to create an app, generate a token, or get anything approved by anybody in
 * their own Business settings.
 *
 * Read from settings rather than env on purpose: the app can be re-created and the
 * secret rotated, and neither should need a deploy. Nothing falls back to env, so an
 * unconfigured platform simply has no one-click button, which is the honest state.
 */

export interface MetaAppConfig {
  appId: string | null;
  appSecret: string | null;
  /** Facebook Login for Business configuration id. Also what pins the flow to v4. */
  esConfigId: string | null;
  webhookVerifyToken: string | null;
  /** Graph version used for every onboarding call. */
  version: string;
}

function safeDecrypt(enc: string | null | undefined): string | null {
  if (!enc) return null;
  return decryptWithSecret(enc, env.BETTER_AUTH_SECRET);
}

export async function resolveMetaAppConfig(): Promise<MetaAppConfig> {
  const s = await prisma.appSetting.findUnique({
    where: { id: "singleton" },
    select: {
      metaAppId: true,
      metaAppSecretEnc: true,
      metaEsConfigId: true,
      metaWebhookVerifyTokenEnc: true,
    },
  });
  return {
    appId: s?.metaAppId?.trim() || null,
    appSecret: safeDecrypt(s?.metaAppSecretEnc),
    esConfigId: s?.metaEsConfigId?.trim() || null,
    webhookVerifyToken: safeDecrypt(s?.metaWebhookVerifyTokenEnc),
    version: env.META_GRAPH_API_VERSION,
  };
}

/** Can a tenant be offered the one-click button at all? The browser half needs the app
 *  id and the configuration id; the server half needs the secret. Missing any of the
 *  three means the button would open a popup that dead-ends, so it is not shown. */
export function metaAppReady(c: MetaAppConfig): boolean {
  return !!c.appId && !!c.appSecret && !!c.esConfigId;
}

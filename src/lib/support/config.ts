import "server-only";
import { type SupportKind } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isSupportMode, type SupportMode } from "@/lib/support/model";

/**
 * The platform's support routing, read from the singleton AppSetting row.
 *
 * PLATFORM-WIDE, never per tenant. How Assess360 handles its own support queue is a
 * decision about Assess360, and a tenant reading a per-tenant copy of it would be
 * reading a setting they cannot see or change.
 *
 * Every read is defensive: the column holds a string so a value nobody recognises is
 * possible, and the fallback is IN_APP, because an unrecognised mode must not silently
 * withdraw the only way a customer has of reporting that their funnel has stopped.
 */

const SEL = {
  supportMode: true,
  onboardingMode: true,
  supportInboxEmail: true,
  supportWebhookUrl: true,
} as const;

interface SupportSettingRow {
  supportMode: string;
  onboardingMode: string;
  supportInboxEmail: string | null;
  supportWebhookUrl: string | null;
}

async function row(): Promise<SupportSettingRow | null> {
  return prisma.appSetting.findUnique({
    where: appSettingWhere(null) as never,
    select: SEL,
  }) as unknown as Promise<SupportSettingRow | null>;
}

export interface SupportRouting {
  support: SupportMode;
  onboarding: SupportMode;
  /** Where EMAIL mode forwards to. Null when it was never set. */
  inboxEmail: string | null;
  /**
   * Where a reply is announced, as one POST. Null = nothing is posted.
   *
   * This is the whole of the WhatsApp story now: the CRM on the other end owns the
   * templates, the opt-in state and the sending number, and this app owns the fact
   * that there is a reply.
   */
  webhookUrl: string | null;
}

function modeOf(value: string | null | undefined): SupportMode {
  return value && isSupportMode(value) ? value : "IN_APP";
}

/** The whole routing config in one read, for a screen that needs more than one field. */
export async function resolveSupportRouting(): Promise<SupportRouting> {
  const s = await row();
  return {
    support: modeOf(s?.supportMode),
    onboarding: modeOf(s?.onboardingMode),
    inboxEmail: s?.supportInboxEmail?.trim() || null,
    webhookUrl: s?.supportWebhookUrl?.trim() || null,
  };
}

/** The mode for one kind. The question almost every caller is actually asking. */
export async function resolveSupportMode(kind: SupportKind): Promise<SupportMode> {
  const s = await row();
  return modeOf(kind === "ONBOARDING" ? s?.onboardingMode : s?.supportMode);
}

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { appSettingWhere } from "@/lib/settings/tenant-row";

/**
 * The consent line shown under every opt-in form.
 *
 * Shown, ticked and not changeable: the owner's decision, and the honest way to build
 * it is to treat it as a DISCLOSURE rather than a choice. So nothing is sent up from
 * the browser - a checkbox nobody can move carries no information - and the server
 * stamps the consent and the exact wording at the moment it creates the contact. What
 * is stored is what was displayed, which is the only version of this that is worth
 * anything if it is ever questioned.
 *
 * 🟡 A pre-ticked box the person cannot untick is weaker consent than a box they tick
 * themselves, under both GDPR and India's DPDP. The unsubscribe link on every message
 * carries most of the weight here. Making the box optional later is a change to this
 * module and the one input, not a rebuild.
 */

export const DEFAULT_CONSENT_TEXT =
  "I agree to receive my results and related messages by email and WhatsApp. You can unsubscribe from any message.";

/** This tenant's wording, or the default. Never blank. */
export async function resolveConsentText(tenantId: string | null): Promise<string> {
  try {
    const s = await prisma.appSetting.findUnique({
      where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: { consentText: true },
    });
    return s?.consentText?.trim() || DEFAULT_CONSENT_TEXT;
  } catch {
    return DEFAULT_CONSENT_TEXT;
  }
}

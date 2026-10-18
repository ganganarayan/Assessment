import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveMetaConfig } from "@/lib/settings/config";
import {
  updateMetaSettings,
  updateMetaNotUsed,
  updateRazorpaySettings,
  updateRazorpayNonGstSettings,
} from "@/features/workspace/actions/integrations";
import { updateSmtpSettings } from "@/features/nurture/actions";
import { updateThemeColors } from "@/features/workspace/actions/theme";
import { updateBookingUrl } from "@/features/workspace/actions/booking";
import { updateSupportEmail } from "@/features/workspace/actions/support";
import { DEFAULT_THEME_COLORS } from "@/features/workspace/theme-colors";
import { EMAIL_PRESETS } from "@/features/onboarding/steps";

/**
 * WHERE EACH ANSWER ACTUALLY GOES.
 *
 * Every step writes through the action that already owns its value, never into a
 * settings table of its own. That is the whole reason the sequence can be trusted: the
 * pixel it saves is the pixel the funnel fires, because it is saved by the same function
 * the Settings screen calls. A parallel write path would be a second source of truth and
 * the two would drift in the direction nobody notices.
 *
 * 🔴 READ, MERGE, WRITE - NOT WRITE. Those actions take whole groups of fields and null
 * what they are passed blank: `updateMetaSettings("", token)` wipes the pixel, and
 * `updateSmtpSettings` rewrites the host, port, user and from-address together. A
 * sequence that asks one question at a time therefore has to send the current values
 * back with the one that changed, which is what every read below is for. The encrypted
 * secrets are the exception and are safe: those actions only overwrite a secret when
 * they are handed a non-blank one, so passing "" keeps what is stored.
 *
 * Steps with nothing to save here fall through to `ok` and are recorded in the journal
 * by the caller: the website, the routing choices, the checks, the one-click WhatsApp
 * connect (the provider's own flow writes those columns), the hand-off, and every
 * acknowledgement at the end of the sequence.
 */

export type SaveResult = { ok: true } | { ok: false; error: string };

export async function persistStep(args: {
  tenantId: string;
  userId: string;
  key: string;
  value: string;
}): Promise<SaveResult> {
  const { tenantId, userId, key } = args;
  const value = args.value.trim();

  switch (key) {
    case "businessName": {
      await prisma.tenant.update({ where: { id: tenantId }, data: { name: value.slice(0, 120) } });
      return { ok: true };
    }

    case "whatsapp": {
      await prisma.user.update({ where: { id: userId }, data: { whatsapp: value.slice(0, 32) } });
      return { ok: true };
    }

    case "metaUse": {
      // "Not yet" is a real answer and it has a column: metaNotUsed is what stops the
      // app warning them about a pixel they have deliberately not set.
      return updateMetaNotUsed(value === "no");
    }

    case "metaPixel": {
      const r = await updateMetaSettings(value, "");
      // Saying yes to Meta by giving a pixel contradicts an earlier "not yet", and the
      // flag would otherwise keep suppressing every warning about it.
      if (r.ok) await updateMetaNotUsed(false);
      return r;
    }

    case "metaCapiToken": {
      // The pixel comes back from the same resolver the funnel reads, because passing a
      // blank one here would delete it.
      const meta = await resolveMetaConfig(tenantId);
      return updateMetaSettings(meta.pixelId ?? "", value);
    }

    /**
     * The three Razorpay fields, written to WHICHEVER ACCOUNT they named.
     *
     * The two accounts are separate columns and separate actions, and the sequence asks
     * which one once rather than walking everybody through six fields. The other account
     * is a Settings screen later, by the owner's decision: onboarding connects the one
     * they actually collect on.
     */
    case "razorpayKeyId": {
      const nonGst = await onNonGstAccount(tenantId);
      return nonGst ? updateRazorpayNonGstSettings(value, "", "") : updateRazorpaySettings(value, "", "");
    }

    case "razorpayKeySecret": {
      const nonGst = await onNonGstAccount(tenantId);
      const keyId = await razorpayKeyId(tenantId, nonGst);
      return nonGst
        ? updateRazorpayNonGstSettings(keyId, value, "")
        : updateRazorpaySettings(keyId, value, "");
    }

    case "razorpayWebhookSecret": {
      const nonGst = await onNonGstAccount(tenantId);
      const keyId = await razorpayKeyId(tenantId, nonGst);
      return nonGst
        ? updateRazorpayNonGstSettings(keyId, "", value)
        : updateRazorpaySettings(keyId, "", value);
    }

    case "emailProvider": {
      const preset = EMAIL_PRESETS[value];
      const current = await smtpNow(tenantId);
      // "Another provider" asks for the host and port in the next two steps, so there
      // is nothing to write yet beyond keeping what is already there.
      if (!preset) return { ok: true };
      return updateSmtpSettings({
        ...current,
        host: preset.host,
        port: String(preset.port),
        secure: preset.secure,
      });
    }

    case "smtpHost": {
      const current = await smtpNow(tenantId);
      return updateSmtpSettings({ ...current, host: value });
    }

    case "smtpPort": {
      const current = await smtpNow(tenantId);
      // 465 is the implicit-TLS port; everything else goes through STARTTLS, which is
      // what `secure: false` means to nodemailer.
      return updateSmtpSettings({ ...current, port: value, secure: value === "465" });
    }

    case "smtpUser": {
      const current = await smtpNow(tenantId);
      return updateSmtpSettings({ ...current, user: value });
    }

    case "emailFrom": {
      const current = await smtpNow(tenantId);
      const tenant = await prisma.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      return updateSmtpSettings({
        ...current,
        fromEmail: value,
        // The display name is not a question. It is the business name they gave in step
        // one, and asking for it again is how a sequence starts feeling like a form.
        fromName: current.fromName || tenant?.name || "",
        // A provider that needs a username almost always wants the sending address, and
        // the preset path needs none at all.
        user: current.user || value,
      });
    }

    case "emailToken": {
      const current = await smtpNow(tenantId);
      return updateSmtpSettings({ ...current, pass: value });
    }

    case "brandColor": {
      const theme = await prisma.theme.findUnique({ where: { tenantId }, select: { secondaryColor: true } });
      return updateThemeColors({
        primaryColor: value,
        secondaryColor: theme?.secondaryColor ?? DEFAULT_THEME_COLORS.secondaryColor,
      });
    }

    case "bookingUrl": {
      return updateBookingUrl(value);
    }

    case "supportEmail": {
      return updateSupportEmail(value);
    }

    default:
      return { ok: true };
  }
}

/** Which account they named, from the journal. Defaults to the GST one, which is what
 *  the great majority of workspaces collect on. */
async function onNonGstAccount(tenantId: string): Promise<boolean> {
  const row = await prisma.onboardingAnswer.findUnique({
    where: { tenantId_stepKey: { tenantId, stepKey: "razorpayAccount" } },
    select: { value: true },
  });
  return row?.value === "nongst";
}

/** The Key ID as stored, so saving a secret cannot null it. */
async function razorpayKeyId(tenantId: string, nonGst: boolean): Promise<string> {
  const s = await prisma.appSetting.findUnique({
    where: { tenantId },
    select: { razorpayKeyId: true, razorpayNonGstKeyId: true },
  });
  return (nonGst ? s?.razorpayNonGstKeyId : s?.razorpayKeyId) ?? "";
}

/** The sender as stored, in the shape updateSmtpSettings takes. `pass` is blank, which
 *  that action reads as "keep the stored one". */
async function smtpNow(tenantId: string): Promise<{
  host: string;
  port: string;
  secure: boolean;
  user: string;
  pass: string;
  fromName: string;
  fromEmail: string;
}> {
  const s = await prisma.appSetting.findUnique({
    where: { tenantId },
    select: {
      smtpHost: true,
      smtpPort: true,
      smtpSecure: true,
      smtpUser: true,
      smtpFromName: true,
      smtpFromEmail: true,
    },
  });
  return {
    host: s?.smtpHost ?? "",
    port: s?.smtpPort != null ? String(s.smtpPort) : "",
    secure: s?.smtpSecure ?? false,
    user: s?.smtpUser ?? "",
    pass: "",
    fromName: s?.smtpFromName ?? "",
    fromEmail: s?.smtpFromEmail ?? "",
  };
}

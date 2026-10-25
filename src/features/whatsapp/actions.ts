"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret, decryptWithSecret } from "@/lib/crypto";
import { formatIST } from "@/lib/date";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { featureDenied } from "@/lib/features/release";
import { appSettingWhere, tenantAppSettingId } from "@/lib/settings/tenant-row";
import { resolveMetaAppConfig, metaAppReady } from "@/lib/settings/meta-app";
import {
  exchangeCodeForBusinessToken,
  getPhoneNumber,
  listWabaPhoneNumbers,
  startSmbSync,
  subscribeAppToWaba,
  unsubscribeAppFromWaba,
  type WabaPhoneNumber,
} from "@/lib/whatsapp/graph";
import { describeTimeLeft, syncWindowClosesAt, syncWindowOpen } from "@/lib/whatsapp/sync-window";
import { type ActionResult } from "@/features/assessment/actions/shared";
import { embeddedSignupSchema, syncKindSchema, type WhatsAppConnectView } from "@/features/whatsapp/types";

/**
 * One-click WhatsApp onboarding, server half.
 *
 * The business clicks once, Meta's popup takes their login and their consent, and
 * everything from the returned code onwards happens here with no further typing.
 *
 * What it replaces is the manual path: add a System user in Business settings,
 * generate a permanent token, paste five fields. That path is also the one that asks a
 * second full-control admin to approve each step, which makes it unusable for anybody
 * who shares a business portfolio with other admins. Nothing here touches Business
 * settings, so nothing here needs anybody's approval.
 *
 * Scope follows the acting tenant, like the rest of the nurture settings: the platform
 * view writes the singleton row, a workspace writes its own.
 */

const enc = (v: string) => encryptWithSecret(v.trim(), env.BETTER_AUTH_SECRET);

async function upsertSettings(tenantId: string | null, data: Prisma.AppSettingUncheckedUpdateInput) {
  await prisma.appSetting.upsert({
    where: appSettingWhere(tenantId) as Prisma.AppSettingWhereUniqueInput,
    update: data,
    create: {
      id: tenantId ? tenantAppSettingId(tenantId) : "singleton",
      tenantId,
      ...(data as Prisma.AppSettingUncheckedCreateInput),
    },
  });
}

function revalidateBoth() {
  revalidatePath("/admin/settings");
  revalidatePath("/admin/nurture");
  revalidatePath("/w/settings");
  revalidatePath("/w/nurture");
}

/**
 * The history import, in a sentence.
 *
 * Not exported: a "use server" module may export async functions only, and this is
 * display text rather than an action. The counts come from our own rows; the
 * percentage is Meta's own figure from the last chunk it sent.
 */
function describeHistoryProgress(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as { progress?: number; messages?: number; declined?: { message?: string } };
  if (p.declined) {
    return "Your past chats were not shared from the phone, so only new messages will appear here.";
  }
  const bits: string[] = [];
  if (typeof p.progress === "number" && p.progress > 0) bits.push(Math.round(p.progress) + "% in");
  if (typeof p.messages === "number" && p.messages > 0) {
    // Locale named explicitly, never left to the server's own: on Railway that is US.
    bits.push(p.messages.toLocaleString("en-IN") + " messages so far");
  }
  return bits.length ? bits.join(", ") : null;
}

/** Record WHY a connect failed, so the card can say it instead of going quiet. */
async function recordFailure(tenantId: string | null, error: string): Promise<ActionResult<{ note?: string }>> {
  await upsertSettings(tenantId, { wabaOnboardError: error.slice(0, 1000) });
  revalidateBoth();
  return { ok: false, error };
}

/** Everything the connect card needs to draw itself, for the acting scope. */
export async function getWhatsAppConnectInfo(): Promise<WhatsAppConnectView> {
  const scope = await resolveActingScope();
  const [app, s] = await Promise.all([
    resolveMetaAppConfig(),
    prisma.appSetting.findUnique({
      where: appSettingWhere(scope.tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: {
        wabaPhoneNumberId: true,
        wabaBusinessAccountId: true,
        wabaAccessTokenEnc: true,
        wabaDisplayPhone: true,
        wabaVerifiedName: true,
        wabaIsOnBizApp: true,
        wabaOnboardedAt: true,
        wabaOnboardError: true,
        wabaContactsSyncAt: true,
        wabaHistorySyncAt: true,
        wabaSyncError: true,
        wabaHistoryProgress: true,
      },
    }),
  ]);

  // Connected means there is a TOKEN. A phone number id on its own is a half-filled
  // form, not a connection, and offering to disconnect one would be a lie.
  const connected = s?.wabaAccessTokenEnc
    ? {
        phoneNumberId: s.wabaPhoneNumberId ?? "",
        wabaId: s.wabaBusinessAccountId ?? "",
        displayPhone: s.wabaDisplayPhone ?? "",
        verifiedName: s.wabaVerifiedName ?? "",
        isOnBizApp: s.wabaIsOnBizApp,
        onboardedAt: s.wabaOnboardedAt ? formatIST(s.wabaOnboardedAt) : null,
        // Read off what Meta reported, not off how the connection was requested. An
        // ordinary one-click onboarding stamps wabaOnboardedAt too, so treating that
        // stamp as proof of coexistence was a straightforward lie: only is_on_biz_app
        // distinguishes a number that is still answering on somebody's phone.
        source: !s.wabaOnboardedAt
          ? ("MANUAL" as const)
          : s.wabaIsOnBizApp
            ? ("COEXISTENCE" as const)
            : ("CLOUD_API" as const),
        sync: {
          // Only a number still living on a phone has anything to hand over.
          available: Boolean(s.wabaOnboardedAt && s.wabaIsOnBizApp),
          contactsAt: s.wabaContactsSyncAt ? formatIST(s.wabaContactsSyncAt) : null,
          historyAt: s.wabaHistorySyncAt ? formatIST(s.wabaHistorySyncAt) : null,
          closesAt: (() => {
            const c = syncWindowClosesAt(s.wabaOnboardedAt);
            return c ? formatIST(c) : null;
          })(),
          timeLeft: describeTimeLeft(s.wabaOnboardedAt),
          windowOpen: syncWindowOpen(s.wabaOnboardedAt),
          lastError: s.wabaSyncError ?? null,
          historyNote: describeHistoryProgress(s.wabaHistoryProgress),
        },
      }
    : null;

  return {
    ready: metaAppReady(app),
    appId: app.appId ?? "",
    configId: app.esConfigId ?? "",
    graphVersion: app.version,
    connected,
    lastError: s?.wabaOnboardError ?? null,
  };
}

/**
 * Finish what the popup started: code in, working WhatsApp connection out.
 *
 * The order is Meta's documented Tech Provider onboarding, minus the register step:
 *   1. exchange the 30-second code for the business token
 *   2. find out which number this is, and whether it really is on the Business app
 *   3. subscribe our app to their WABA so webhooks arrive
 *   4. store it
 *
 * Step 3 failing does NOT fail the connect. By then the token is valid and messages
 * would send, so throwing it away would mean asking the business to redo the popup to
 * fix something they cannot see. It is reported in the result instead.
 */
export async function completeWhatsAppConnect(input: unknown): Promise<ActionResult<{ note?: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  // The card is hidden while WhatsApp is held back (wabaVisible reads the same switch),
  // but the action refuses on its own: connecting a number to a feature whose Tech
  // Provider approval has not landed strands the business, not us.
  const held = await featureDenied("whatsapp", scope.tenantId);
  if (held) return held;

  const parsed = embeddedSignupSchema.safeParse(input);
  if (!parsed.success) {
    return recordFailure(scope.tenantId, "Meta sent back something we could not read. Try connecting again.");
  }
  const { code, wabaId, phoneNumberId, businessId, flow } = parsed.data;

  const app = await resolveMetaAppConfig();
  if (!metaAppReady(app) || !app.appId || !app.appSecret) {
    return {
      ok: false,
      error: "WhatsApp onboarding is not set up on this platform yet. Ask the owner to add the Meta app details.",
    };
  }
  const version = app.version;

  const exchanged = await exchangeCodeForBusinessToken({
    appId: app.appId,
    appSecret: app.appSecret,
    code,
    version,
  });
  if (!exchanged.ok) return recordFailure(scope.tenantId, exchanged.error);
  const token = exchanged.token;

  // WHICH number. The coexistence finish event carries the WABA and often no number,
  // so the WABA is asked. One number is taken; several are reported rather than
  // guessed at, because picking the wrong one sends somebody else's customers our
  // messages.
  let phone: WabaPhoneNumber;
  if (phoneNumberId) {
    const got = await getPhoneNumber({ phoneNumberId, token, version });
    if (!got.ok) return recordFailure(scope.tenantId, got.error);
    phone = got.phone;
  } else {
    const list = await listWabaPhoneNumbers({ wabaId, token, version });
    if (!list.ok) return recordFailure(scope.tenantId, list.error);
    const first = list.phones[0];
    if (!first) {
      return recordFailure(
        scope.tenantId,
        "That WhatsApp Business Account has no phone number on it yet. Add the number in WhatsApp Manager, then connect again.",
      );
    }
    if (list.phones.length > 1) {
      const names = list.phones.map((p) => p.displayPhone || p.id).join(", ");
      return recordFailure(
        scope.tenantId,
        "That account has more than one number (" +
          names +
          "). Meta did not say which one to use, so nothing was saved. Connect again and choose a single number.",
      );
    }
    phone = first;
  }

  const subscribed = await subscribeAppToWaba({ wabaId, token, version });

  await upsertSettings(scope.tenantId, {
    wabaPhoneNumberId: phone.id,
    wabaBusinessAccountId: wabaId,
    wabaAccessTokenEnc: enc(token),
    // Pin the version this connection was made against, so the sender and the
    // onboarding cannot drift apart after a platform-wide version bump.
    wabaApiVersion: version,
    wabaBusinessId: businessId ?? null,
    wabaDisplayPhone: phone.displayPhone,
    wabaVerifiedName: phone.verifiedName,
    wabaIsOnBizApp: phone.isOnBizApp,
    wabaOnboardedAt: new Date(),
    wabaOnboardError: null,
  });

  revalidateBoth();

  // Said plainly rather than hidden: a number that is not on the Business app is a
  // normal Cloud API number. It works, but it is not coexistence, and somebody who
  // expected to keep answering on their phone needs to know which one they got.
  const notes: string[] = [];
  if (!subscribed.ok) {
    notes.push(
      "Connected, but Meta refused the webhook subscription: " +
        subscribed.error +
        " Messages will still send; delivery updates may not arrive.",
    );
  }
  if (!phone.isOnBizApp) {
    notes.push(
      flow === "COEXISTENCE"
        ? // They went through the coexistence screens and Meta still says the number
          // is not shared with a phone. Nothing is broken on our side, and the number
          // works, but the one thing they were trying to achieve did not happen - and
          // it is invisible unless we say it. Almost always the confirmation in the
          // app was never tapped, or it was tapped too late.
          "🟡 You asked to connect the number from your phone, but Meta reports it as a Cloud API number that is not shared with the WhatsApp Business app. Sending works. If you meant to keep answering on your phone, disconnect and try again, finishing the Connect step in WhatsApp while this window is still open."
        : "This number is on the Cloud API only, not shared with the WhatsApp Business app on a phone.",
    );
  }
  return { ok: true, data: notes.length ? { note: notes.join(" ") } : {} };
}

/**
 * Ask the phone for the owner's own contacts, or their own past chats.
 *
 * 🔴 ONE ATTEMPT EACH, per onboarding, inside about 24 hours. That single fact shapes
 * everything below:
 *
 *   - The local stamp is checked BEFORE Meta is called. A second press is always a
 *     mistake, and finding out by spending the attempt is the one outcome there is no
 *     way back from.
 *   - A refusal is recorded and shown, never retried. Retrying a sync is how one
 *     attempt becomes none.
 *   - The 24 hours are a WARNING, not a gate. Meta enforces the window; our clock
 *     could be wrong, so a closed window still lets the owner try. Denying somebody
 *     their only chance on the strength of our own arithmetic would be worse than
 *     letting Meta say no.
 *
 * Accepted does not mean arrived. The contacts and chats come back later over the
 * webhook, in chunks, and the business can still decline on their phone after we have
 * asked - which turns up as an error inside the history webhook, not here.
 */
export async function startWhatsAppSync(input: unknown): Promise<ActionResult<{ note?: string }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const held = await featureDenied("whatsapp", scope.tenantId);
  if (held) return held;

  const parsed = syncKindSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That is not something we can ask Meta for." };
  const kind = parsed.data;

  const [app, s] = await Promise.all([
    resolveMetaAppConfig(),
    prisma.appSetting.findUnique({
      where: appSettingWhere(scope.tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: {
        wabaPhoneNumberId: true,
        wabaAccessTokenEnc: true,
        wabaApiVersion: true,
        wabaIsOnBizApp: true,
        wabaOnboardedAt: true,
        wabaContactsSyncAt: true,
        wabaHistorySyncAt: true,
      },
    }),
  ]);

  if (!s?.wabaAccessTokenEnc || !s.wabaPhoneNumberId) {
    return { ok: false, error: "No WhatsApp number is connected here yet." };
  }
  if (!s.wabaIsOnBizApp) {
    return {
      ok: false,
      error:
        "This is a Cloud API number, so there is no phone to copy from. Only a number you also use in the WhatsApp Business app can bring its contacts and chats across.",
    };
  }

  const already = kind === "CONTACTS" ? s.wabaContactsSyncAt : s.wabaHistorySyncAt;
  if (already) {
    return {
      ok: false,
      error:
        (kind === "CONTACTS" ? "Contacts were" : "Past chats were") +
        " already requested on " +
        formatIST(already) +
        " IST. Meta allows this once per connection, so asking again would be refused. If nothing arrived, disconnect and connect the number again to get a fresh attempt.",
    };
  }

  const token = decryptWithSecret(s.wabaAccessTokenEnc, env.BETTER_AUTH_SECRET);
  if (!token) {
    return { ok: false, error: "The stored WhatsApp token could not be read. Reconnect the number." };
  }

  const started = await startSmbSync({
    phoneNumberId: s.wabaPhoneNumberId,
    token,
    // The version this connection was made against, not today's platform default.
    version: s.wabaApiVersion || app.version,
    syncType: kind === "CONTACTS" ? "smb_app_state_sync" : "history",
  });

  if (!started.ok) {
    await upsertSettings(scope.tenantId, { wabaSyncError: started.error.slice(0, 1000) });
    revalidateBoth();
    return { ok: false, error: started.error };
  }

  await upsertSettings(scope.tenantId, {
    ...(kind === "CONTACTS" ? { wabaContactsSyncAt: new Date() } : { wabaHistorySyncAt: new Date() }),
    wabaSyncError: null,
  });
  revalidateBoth();

  // Said every time, because the two failure modes left are both on the owner's side
  // and both silent: closing WhatsApp mid-copy, and having declined the share.
  const note =
    kind === "CONTACTS"
      ? "Asked Meta for your contacts. Keep WhatsApp open on the phone until they stop arriving."
      : "Asked Meta for your past chats. They arrive in batches over the next while, up to about six months of 1:1 conversations, and only if you agreed to share them on the phone. Keep WhatsApp open.";
  const left = describeTimeLeft(s.wabaOnboardedAt);
  return { ok: true, data: { note: left ? note + " (" + left + " to ask for the other one.)" : note } };
}

/**
 * Hand the number back.
 *
 * Unsubscribes our app first so their WABA stops sending us webhooks, then clears
 * every column the connect wrote. The local clear happens even when Meta says no,
 * because Disconnect has to mean the credential is gone from our side - including when
 * the token was already revoked at Meta's end and every call with it fails.
 */
export async function disconnectWhatsApp(): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  // Disconnect is NOT gated on the release switch on purpose: a workspace that already
  // connected a number must always be able to take it back, including after the feature
  // was held back again. Only the view-only check above applies.

  const [app, s] = await Promise.all([
    resolveMetaAppConfig(),
    prisma.appSetting.findUnique({
      where: appSettingWhere(scope.tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: { wabaBusinessAccountId: true, wabaAccessTokenEnc: true },
    }),
  ]);

  if (s?.wabaAccessTokenEnc && s.wabaBusinessAccountId) {
    const token = decryptWithSecret(s.wabaAccessTokenEnc, env.BETTER_AUTH_SECRET);
    if (token) {
      await unsubscribeAppFromWaba({ wabaId: s.wabaBusinessAccountId, token, version: app.version });
    }
  }

  await upsertSettings(scope.tenantId, {
    wabaPhoneNumberId: null,
    wabaBusinessAccountId: null,
    wabaAccessTokenEnc: null,
    wabaBusinessId: null,
    wabaDisplayPhone: null,
    wabaVerifiedName: null,
    wabaIsOnBizApp: false,
    wabaOnboardedAt: null,
    wabaOnboardError: null,
    // Cleared too, so reconnecting genuinely does give a fresh attempt at each sync
    // rather than leaving the card refusing on the strength of the old connection.
    wabaContactsSyncAt: null,
    wabaHistorySyncAt: null,
    wabaSyncError: null,
  });

  revalidateBoth();
  return { ok: true };
}

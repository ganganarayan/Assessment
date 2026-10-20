"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { resetFreeBusyCache } from "@/lib/google/calendar";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The owner's side of the Google connection: disconnect, pause, resume, and the
 * platform's own OAuth credentials.
 *
 * Connecting is not here - it is a REDIRECT, so it has to be a route (/api/google/
 * connect) rather than a server action, which cannot send a browser to Google.
 */

function refresh() {
  revalidatePath("/w/calendar/availability");
  revalidatePath("/admin/calendar/availability");
}

/**
 * Disconnect a calendar from Google.
 *
 * DELETES the row rather than blanking it: revoking should leave nothing behind, and a
 * half-empty row holding somebody's refresh token is the opposite of that.
 *
 * 🟡 Events already written to their calendar are LEFT ALONE, on purpose. They are
 * appointments that genuinely exist, some of them tomorrow, and a product that empties
 * your diary because you unlinked an integration has destroyed real information. The
 * card says so before the button is pressed. googleEventId stays on each appointment,
 * so reconnecting the same Google account picks the same events back up instead of
 * creating duplicates.
 */
export async function disconnectGoogleCalendar(calendarKey: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);

  const deleted = await prisma.googleCalendarAccount.deleteMany({
    where: { tenantId, calendarKey: calendarKey.trim() || "shared" },
  });
  if (deleted.count === 0) return { ok: false, error: "That calendar is not connected." };

  resetFreeBusyCache();
  refresh();
  return { ok: true };
}

/**
 * Pause or resume without disconnecting.
 *
 * Kept apart from disconnecting because they answer different questions. Paused means
 * "stop writing to my calendar for now" and survives as a connection, so resuming is a
 * switch rather than another trip through Google's consent screen. While paused,
 * nothing is written AND free/busy is not read, so the two directions stop together -
 * a pause that silently kept reading would be a surprise of the worst kind.
 */
export async function setGoogleSyncEnabled(calendarKey: string, enabled: boolean): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);

  const updated = await prisma.googleCalendarAccount.updateMany({
    where: { tenantId, calendarKey: calendarKey.trim() || "shared" },
    data: { syncEnabled: enabled },
  });
  if (updated.count === 0) return { ok: false, error: "That calendar is not connected." };

  resetFreeBusyCache();
  refresh();
  return { ok: true };
}

/**
 * Save the platform's Google OAuth app. SUPER ADMIN ONLY, on the platform scope.
 *
 * One Google Cloud project serves every workspace, so this is the owner's credential
 * and not a tenant setting. The guard is the scope itself: a tenant admin resolves to
 * their own tenant, which is not the platform, and is refused.
 */
export async function saveGoogleApp(clientId: string, clientSecret: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper || !isPlatformScope(configTenantOf(scope))) {
    return { ok: false, error: "The Google app belongs to the platform, not to a workspace." };
  }

  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id) return { ok: false, error: "The client ID is required." };

  await prisma.appSetting.upsert({
    where: appSettingWhere(null) as Prisma.AppSettingWhereUniqueInput,
    update: {
      googleClientId: id,
      // Blank leaves the stored secret alone, so re-saving the id does not wipe it.
      ...(secret ? { googleClientSecretEnc: encryptWithSecret(secret, env.BETTER_AUTH_SECRET) } : {}),
    },
    create: {
      id: "singleton",
      googleClientId: id,
      googleClientSecretEnc: secret ? encryptWithSecret(secret, env.BETTER_AUTH_SECRET) : null,
    },
  });
  refresh();
  return { ok: true };
}

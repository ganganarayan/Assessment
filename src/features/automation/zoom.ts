"use server";

import { revalidatePath } from "next/cache";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { encryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeEditDenied, configTenantOf } from "@/lib/tenant/acting";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { isPlatformScope } from "@/lib/tenant/platform-tenant";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * The owner's side of the Zoom connection. Connecting is a redirect, so it lives in
 * /api/zoom/connect; what is left is taking it away, and the platform's own app.
 */

function refresh() {
  revalidatePath("/w/automations");
  revalidatePath("/admin/automations");
}

/**
 * Disconnect Zoom.
 *
 * Deletes the row, so nothing is left holding a refresh token.
 *
 * 🟡 Meetings already created are LEFT IN ZOOM, and appointments keep the links they
 * were given. Those are real calls, some of them tomorrow, and cancelling a Zoom
 * meeting that somebody is about to join because an integration was unlinked would be
 * destroying a booking rather than tidying up. New bookings simply get no meeting until
 * Zoom is connected again.
 */
export async function disconnectZoom(): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const tenantId = configTenantOf(scope);

  const deleted = await prisma.zoomAccount.deleteMany({ where: { tenantId } });
  if (deleted.count === 0) return { ok: false, error: "Zoom is not connected." };
  refresh();
  return { ok: true };
}

/**
 * Save the platform's Zoom app. SUPER ADMIN ONLY, on the platform scope.
 *
 * One Marketplace app for the whole product: a tenant clicks Connect and approves a
 * consent screen rather than building an app of their own.
 */
export async function saveZoomApp(clientId: string, clientSecret: string): Promise<ActionResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  if (!scope.isSuper || !isPlatformScope(configTenantOf(scope))) {
    return { ok: false, error: "The Zoom app belongs to the platform, not to a workspace." };
  }

  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id) return { ok: false, error: "The client ID is required." };

  await prisma.appSetting.upsert({
    where: appSettingWhere(null) as Prisma.AppSettingWhereUniqueInput,
    update: {
      zoomClientId: id,
      // Blank keeps the stored secret, so re-saving the id does not wipe it.
      ...(secret ? { zoomClientSecretEnc: encryptWithSecret(secret, env.BETTER_AUTH_SECRET) } : {}),
    },
    create: {
      id: "singleton",
      zoomClientId: id,
      zoomClientSecretEnc: secret ? encryptWithSecret(secret, env.BETTER_AUTH_SECRET) : null,
    },
  });
  refresh();
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { env } from "@/lib/env";
import { decryptWithSecret } from "@/lib/crypto";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { featureDenied } from "@/lib/features/release";
import { appSettingWhere } from "@/lib/settings/tenant-row";
import { resolveMetaAppConfig } from "@/lib/settings/meta-app";
import { buildWabaSnapshot } from "@/lib/whatsapp/snapshot";
import { type ActionResult } from "@/features/assessment/actions/shared";

/**
 * Asking Meta for a fresh snapshot.
 *
 * Its own module rather than another function in actions.ts, because a "use server"
 * file may export only async functions and this one needs none of the connect flow's
 * helpers. Keeping them apart also keeps a dashboard refresh from ever being able to
 * touch a stored token.
 */

/**
 * 🟡 Gated on EDIT rather than view.
 *
 * A refresh is only a read of Meta, so it is tempting to let anybody press it. But it
 * spends the workspace's API quota, and these edges are rate limited: a view-only
 * member repeatedly refreshing could throttle the sending for everybody. Viewing the
 * stored snapshot needs nothing.
 */
export async function refreshWabaDashboard(): Promise<ActionResult<{ problems: number }>> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;
  const held = await featureDenied("whatsapp", scope.tenantId);
  if (held) return held;

  const [app, s] = await Promise.all([
    resolveMetaAppConfig(),
    prisma.appSetting.findUnique({
      where: appSettingWhere(scope.tenantId) as Prisma.AppSettingWhereUniqueInput,
      select: {
        id: true,
        wabaAccessTokenEnc: true,
        wabaApiVersion: true,
        wabaPhoneNumberId: true,
        wabaBusinessAccountId: true,
      },
    }),
  ]);

  if (!s?.wabaAccessTokenEnc || !s.wabaPhoneNumberId || !s.wabaBusinessAccountId) {
    return { ok: false, error: "No WhatsApp number is connected here, so there is nothing to read." };
  }

  const token = decryptWithSecret(s.wabaAccessTokenEnc, env.BETTER_AUTH_SECRET);
  if (!token) return { ok: false, error: "The stored WhatsApp token could not be read. Reconnect the number." };

  const snapshot = await buildWabaSnapshot({
    phoneNumberId: s.wabaPhoneNumberId,
    wabaId: s.wabaBusinessAccountId,
    token,
    // The version this connection was made against, so a platform-wide bump cannot
    // silently change what the dashboard asks for.
    version: s.wabaApiVersion || app.version,
  });

  await prisma.appSetting.update({
    where: { id: s.id },
    data: { wabaDashboard: snapshot as unknown as Prisma.InputJsonValue },
  });

  revalidatePath("/admin/whatsapp");
  revalidatePath("/w/whatsapp");

  // 🔴 Stored and reported as a success even when panels failed. Every panel fails
  // independently and some are expected to: template analytics is refused until an
  // irreversible switch is thrown, and a sending tier is simply not served on some
  // versions. Calling the whole refresh a failure would throw away the figures that
  // did arrive, which are most of them.
  return { ok: true, data: { problems: Object.keys(snapshot.problems).length } };
}

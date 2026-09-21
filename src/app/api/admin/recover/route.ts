import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { env } from "@/lib/env";
import { resetCredentialPassword } from "@/lib/auth/recover";

/**
 * Break-glass super-admin password recovery (HTTP). Gated by ADMIN_RECOVERY_SECRET.
 *
 *   POST /api/admin/recover
 *   Authorization: Bearer <ADMIN_RECOVERY_SECRET>
 *   { "email": "you@example.com", "newPassword": "at-least-8-chars" }
 *
 * Resets the password ONLY on a SUPER_ADMIN account, then you sign in normally.
 * It does NOT log anyone in — it just sets a real password. When the secret is
 * unset the route is disabled and returns 404 (so it isn't discoverable). Unset
 * or rotate ADMIN_RECOVERY_SECRET in Railway to revoke it.
 */
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

export async function POST(req: Request) {
  const secret = env.ADMIN_RECOVERY_SECRET;
  // Disabled unless a secret is configured — 404 keeps it undiscoverable.
  if (!secret) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token || !safeEqual(token, secret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { email, newPassword } = (body ?? {}) as { email?: unknown; newPassword?: unknown };
  if (typeof email !== "string" || typeof newPassword !== "string") {
    return NextResponse.json({ error: "email and newPassword (strings) are required" }, { status: 400 });
  }

  const result = await resetCredentialPassword(email, newPassword, {
    superAdminOnly: true,
    promoteOwner: true,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });

  // Audit trail: every break-glass use is logged (visible in Railway logs).
  console.warn(
    `[recover] break-glass password reset used for ${result.email}${result.promoted ? " (restored to SUPER_ADMIN)" : ""}`,
  );
  return NextResponse.json({ ok: true, promoted: result.promoted });
}

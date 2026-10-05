import "server-only";
import { cookies } from "next/headers";
import { randomBytes } from "crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * External-gateway hand-off: the per-person half of a return URL that cannot be
 * per-person.
 *
 * A tenant on their own payment link configures ONE success URL on the gateway, so
 * the string that comes back is identical for everybody. The identity therefore has
 * to travel in the browser, not in the URL: a nonce in an httpOnly cookie on our own
 * host, pointing at a row that records which submission is waiting.
 *
 * SameSite=Lax is load-bearing. The return is a top-level GET navigation from the
 * gateway, which Lax permits; Strict would drop the cookie on exactly the request it
 * exists for, and None would hand it to any cross-site request.
 */

/** Cookie name. Short and unremarkable: it is sent on every request to our host. */
export const HANDOFF_COOKIE = "a360_ph";

/** How long a hand-off stays claimable. Long enough for a slow payment page and a
 *  one-time password, short enough that a stale cookie cannot unlock a result days
 *  later from a shared machine. */
export const HANDOFF_TTL_MINUTES = 120;

/**
 * Record a hand-off and plant the cookie. Call immediately BEFORE redirecting to an
 * external payment link.
 *
 * Best-effort by construction: every failure is swallowed. A respondent must never be
 * blocked from paying because we could not write a return ticket - without it they
 * fall back to the email path on the way back, which is the same path a lost cookie
 * takes anyway.
 */
export async function createHandoff(opts: {
  tenantId: string | null;
  submissionId: string;
  email: string | null;
}): Promise<void> {
  // No tenant, no row: the hand-off is resolved per tenant on the way back, and the
  // platform's own funnels use Razorpay directly.
  if (!opts.tenantId) return;
  try {
    const nonce = randomBytes(24).toString("base64url");
    const expiresAt = new Date(Date.now() + HANDOFF_TTL_MINUTES * 60 * 1000);
    await prisma.paymentHandoff.create({
      data: {
        tenantId: opts.tenantId,
        submissionId: opts.submissionId,
        nonce,
        email: opts.email?.trim().toLowerCase() || null,
        expiresAt,
      },
    });
    const jar = await cookies();
    jar.set(HANDOFF_COOKIE, nonce, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: HANDOFF_TTL_MINUTES * 60,
    });
  } catch (e) {
    console.error("[payments] handoff create failed:", e instanceof Error ? e.message : String(e));
  }
}

/** A claimable hand-off: PENDING and not past its expiry. */
const claimable = { status: "PENDING" as const };

/**
 * Claim by nonce (the cookie path). Returns the submission id, or null when there is
 * nothing claimable: no cookie, an unknown nonce, the wrong tenant, already consumed,
 * or expired.
 *
 * The update is conditional on status so two tabs racing cannot both claim it.
 */
export async function claimByNonce(tenantId: string, nonce: string): Promise<string | null> {
  try {
    const row = await prisma.paymentHandoff.findUnique({
      where: { nonce },
      select: { id: true, tenantId: true, submissionId: true, status: true, expiresAt: true },
    });
    if (!row || row.tenantId !== tenantId || row.status !== "PENDING") return null;
    if (row.expiresAt.getTime() < Date.now()) return null;
    const claimed = await prisma.paymentHandoff.updateMany({
      where: { id: row.id, ...claimable },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    return claimed.count === 1 ? row.submissionId : null;
  } catch (e) {
    console.error("[payments] handoff claim failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Claim by email (the fallback path).
 *
 * Needed far more often than it sounds: the Instagram and Facebook in-app browsers
 * routinely hand a payment page to the system browser, and the respondent returns
 * somewhere the cookie never existed. Scoped to this tenant, to PENDING rows inside
 * the window, newest first.
 */
export async function claimByEmail(tenantId: string, email: string): Promise<string | null> {
  const clean = email.trim().toLowerCase();
  if (!clean) return null;
  try {
    const row = await prisma.paymentHandoff.findFirst({
      where: { tenantId, email: clean, ...claimable, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, submissionId: true },
    });
    if (!row) return null;
    const claimed = await prisma.paymentHandoff.updateMany({
      where: { id: row.id, ...claimable },
      data: { status: "CONSUMED", consumedAt: new Date() },
    });
    return claimed.count === 1 ? row.submissionId : null;
  } catch (e) {
    console.error("[payments] handoff email claim failed:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/** Record whatever the gateway appended, for reconciliation. Never proof of payment. */
export async function noteReference(submissionId: string, reference: string): Promise<void> {
  const ref = reference.trim().slice(0, 200);
  if (!ref) return;
  try {
    await prisma.paymentHandoff.updateMany({
      where: { submissionId, status: "CONSUMED", reference: null },
      data: { reference: ref },
    });
  } catch {
    /* reconciliation only - never fails the return */
  }
}

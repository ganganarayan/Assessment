import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { handleRazorpayWebhook } from "@/lib/payments/razorpay-webhook";

/**
 * Per-tenant Razorpay webhook — POST /api/payments/razorpay/[tenant].
 * `[tenant]` is the tenant SLUG. Razorpay for that tenant's account is configured
 * to call this URL, so the HMAC is verified with THAT tenant's own webhook secret.
 * An unknown slug is rejected (never falls back to the platform secret).
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await prisma.tenant.findUnique({ where: { slug }, select: { id: true } });
  if (!tenant) return NextResponse.json({ error: "unknown tenant" }, { status: 404 });
  return handleRazorpayWebhook(req, tenant.id);
}

import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { TEST_PAYMENT_PURPOSE } from "@/features/payments/test-payment-shared";

/**
 * Book a Test Payment. ONE writer, called by both paths that can learn of it: the
 * Checkout return (/api/pay/test/verify) and the Razorpay webhook. Either may arrive
 * first or alone.
 *
 * The row is keyed on the unique Razorpay payment id, so the same payment reported
 * twice is recorded once. Each path stamps its own time into notes (checkoutAt,
 * webhookAt), which is how the paid log can say "webhook received" - the proof that the
 * account's webhook is set up, which is half of what a test payment is for.
 *
 * 🔴 Never fires Meta, never touches a submission, never counts as revenue.
 */
export async function recordTestPayment(input: {
  /** null = the platform's own keys (the singleton), the convention money rows use. */
  tenantId: string | null;
  account: "GST" | "NON_GST";
  providerPaymentId: string;
  providerOrderId: string | null;
  amountMinor: number | null;
  currency: string;
  method: string | null;
  via: "checkout" | "webhook";
  event: string;
}): Promise<void> {
  const stamp = { [input.via === "webhook" ? "webhookAt" : "checkoutAt"]: new Date().toISOString() };

  const existing = await prisma.payment.findUnique({
    where: { providerPaymentId: input.providerPaymentId },
    select: { id: true, purpose: true, notes: true },
  });

  if (existing) {
    // Only ever merge into a test row: a payment id already booked as something else
    // is not ours to relabel.
    if (existing.purpose !== TEST_PAYMENT_PURPOSE) return;
    const prior =
      existing.notes && typeof existing.notes === "object" && !Array.isArray(existing.notes)
        ? (existing.notes as Record<string, unknown>)
        : {};
    await prisma.payment.update({
      where: { id: existing.id },
      data: {
        notes: { ...prior, ...stamp } as Prisma.InputJsonValue,
        ...(input.method ? { method: input.method } : {}),
      },
    });
    return;
  }

  try {
    await prisma.payment.create({
      data: {
        provider: "razorpay",
        providerPaymentId: input.providerPaymentId,
        providerOrderId: input.providerOrderId,
        providerAccount: input.account,
        purpose: TEST_PAYMENT_PURPOSE,
        amount: input.amountMinor,
        currency: input.currency,
        status: "captured",
        method: input.method,
        event: input.event,
        notes: stamp as Prisma.InputJsonValue,
        tenantId: input.tenantId,
      },
    });
  } catch (e) {
    // Lost the race to the other path: the row exists now, so stamp it instead.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      await recordTestPayment(input);
      return;
    }
    throw e;
  }
}

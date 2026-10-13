"use server";

import { randomBytes } from "crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { resolveActingScope, scopeEditDenied } from "@/lib/tenant/acting";
import { resolveRazorpayAccount } from "@/lib/settings/config";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
import { paymentsAllowed } from "@/lib/payments/enabled";
import { payBaseUrl } from "@/features/payments/settle";
import {
  PAY_MIN_PAISE,
  PAY_MAX_PAISE,
  type PaymentLinkAccount,
  type CreateLinkResult,
  type CancelLinkResult,
} from "@/features/payments/links-shared";

/**
 * Generating and withdrawing a payment link for ONE lead, from the Submissions
 * screen. Shared by the platform console and a tenant workspace: the scope decides
 * whose submissions are reachable, exactly as the delete and Meta-verdict actions on
 * the same screen already do.
 *
 * A link is one-shot by design (see the PaymentLink model): paid once and spent, with
 * no time expiry. The operator presses the button again for the next collection.
 */

const Input = z.object({
  submissionId: z.string().min(1),
  /** Rupees, as typed. Converted to paise here - money is never stored as a float. */
  amount: z.number().finite().positive().max(PAY_MAX_PAISE / 100),
  account: z.enum(["GST", "NON_GST"]),
  /** Optional floor for what the client may type. Defaults to the system minimum. */
  minAmount: z.number().finite().nonnegative().max(PAY_MAX_PAISE / 100).optional(),
  description: z.string().max(200).optional(),
});

export async function createPaymentLink(raw: unknown): Promise<CreateLinkResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const parsed = Input.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Enter a valid amount." };
  const { submissionId, amount, account, minAmount, description } = parsed.data;

  const amountPaise = Math.round(amount * 100);
  if (amountPaise < PAY_MIN_PAISE) return { ok: false, error: "Amount is below the ₹1 minimum." };
  const minPaise = Math.max(PAY_MIN_PAISE, Math.round((minAmount ?? 0) * 100));
  if (minPaise > amountPaise) {
    return { ok: false, error: "The minimum cannot be more than the amount you are asking for." };
  }

  // Same scoping rule as every other action on this screen: a super admin who has not
  // entered a workspace may act on any submission, everyone else only on their own.
  // Passing another tenant's id simply matches nothing.
  const where =
    scope.isSuper && scope.tenantId === null
      ? { id: submissionId }
      : { id: submissionId, tenantId: scope.tenantId };
  const sub = await prisma.submission.findFirst({
    where,
    select: { id: true, tenantId: true, assessmentId: true },
  });
  if (!sub) return { ok: false, error: "Not found." };

  // The owner's switches sit above this, as they do over the funnel's own checkout:
  // the platform master switch and the tenant's. Off means this workspace is not
  // taking money at all, so it must not be able to mint a link that does.
  if (!(await paymentsAllowed(sub.tenantId))) {
    return { ok: false, error: "Payments are switched off for this workspace." };
  }

  // The chosen account must actually be configured, checked BEFORE a link exists -
  // the alternative is a link that looks fine until the client presses pay.
  const keys = await resolveRazorpayAccount(sub.tenantId, account as PaymentLinkAccount);
  if (!isRazorpayConfigured(keys)) {
    return {
      ok: false,
      error:
        account === "NON_GST"
          ? "No Non-GST Razorpay keys saved. Add them in Settings first."
          : "No Razorpay keys saved. Add them in Settings first.",
    };
  }

  // 24 random bytes. The token IS the access control on the page, so it is generated
  // here and never derived from anything guessable (an id, an email, a timestamp).
  const token = randomBytes(24).toString("base64url");

  await prisma.paymentLink.create({
    data: {
      token,
      tenantId: sub.tenantId,
      submissionId: sub.id,
      assessmentId: sub.assessmentId,
      account,
      amountPaise,
      minPaise,
      description: description?.trim() || null,
      createdByUserId: scope.user.id,
    },
  });

  const base = await payBaseUrl(sub.tenantId);
  revalidatePath("/admin/submissions");
  revalidatePath("/w/submissions");
  return { ok: true, url: `${base}/pay/${token}` };
}

/**
 * Withdraw a link that has not been paid. Only CREATED rows can go: a paid link is a
 * record of a sale, and a cancelled one is already withdrawn. Nothing is deleted, so
 * "I sent this and then cancelled it" stays answerable.
 */
export async function cancelPaymentLink(id: string): Promise<CancelLinkResult> {
  const scope = await resolveActingScope();
  const denied = scopeEditDenied(scope);
  if (denied) return denied;

  const where =
    scope.isSuper && scope.tenantId === null ? { id } : { id, tenantId: scope.tenantId };
  const link = await prisma.paymentLink.findFirst({ where, select: { id: true, status: true } });
  if (!link) return { ok: false, error: "Not found." };
  if (link.status === "PAID") return { ok: false, error: "That link has already been paid." };

  await prisma.paymentLink.updateMany({ where: { id: link.id, status: "CREATED" }, data: { status: "CANCELLED" } });
  revalidatePath("/admin/submissions");
  revalidatePath("/w/submissions");
  return { ok: true };
}

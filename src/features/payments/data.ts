import "server-only";
import { prisma } from "@/lib/db/prisma";
import { resolveRazorpayAccount } from "@/lib/settings/config";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
import { payBaseUrl } from "@/features/payments/settle";
import { type PaymentLinkAccount, type PaymentLinkView } from "@/features/payments/links-shared";

/**
 * Reads for the Submissions screen: the links already generated for a set of leads,
 * and which of the tenant's two Razorpay accounts can actually be chosen.
 */

/**
 * Links per submission, newest first, batched so a page of 25 leads costs one query.
 *
 * The public URL is rebuilt here rather than stored, so a tenant who later adds or
 * verifies a custom domain does not end up with a table full of links on the old host.
 * The token is the only part that has to persist.
 */
export async function listPaymentLinks(submissionIds: string[]): Promise<Map<string, PaymentLinkView[]>> {
  const out = new Map<string, PaymentLinkView[]>();
  if (submissionIds.length === 0) return out;

  const rows = await prisma.paymentLink.findMany({
    where: { submissionId: { in: submissionIds } },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      token: true,
      tenantId: true,
      submissionId: true,
      account: true,
      amountPaise: true,
      status: true,
      paidPaise: true,
      paidAt: true,
      createdAt: true,
    },
  });
  if (rows.length === 0) return out;

  // One base per tenant, not per row: these pages list a single tenant's leads, so
  // this is almost always one lookup.
  const bases = new Map<string, string>();
  for (const tenantId of new Set(rows.map((r) => r.tenantId))) {
    bases.set(tenantId ?? "", await payBaseUrl(tenantId));
  }

  for (const r of rows) {
    const base = bases.get(r.tenantId ?? "") ?? "";
    const list = out.get(r.submissionId) ?? [];
    list.push({
      id: r.id,
      url: `${base}/pay/${r.token}`,
      account: r.account === "NON_GST" ? "NON_GST" : "GST",
      amount: r.amountPaise / 100,
      status: r.status,
      paidAmount: r.paidPaise != null ? r.paidPaise / 100 : null,
      paidAt: r.paidAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    });
    out.set(r.submissionId, list);
  }
  return out;
}

/**
 * Which accounts this tenant can collect on. An account with no keys is left out
 * rather than shown and refused - a chooser that offers something which cannot work
 * is how an operator ends up sending a dead link to a client.
 */
export async function configuredPaymentAccounts(tenantId: string | null): Promise<PaymentLinkAccount[]> {
  const [gst, nonGst] = await Promise.all([
    resolveRazorpayAccount(tenantId, "GST"),
    resolveRazorpayAccount(tenantId, "NON_GST"),
  ]);
  const out: PaymentLinkAccount[] = [];
  if (isRazorpayConfigured(gst)) out.push("GST");
  if (isRazorpayConfigured(nonGst)) out.push("NON_GST");
  return out;
}

/**
 * Captured PRODUCT sales per submission (the hand-sold final purchase), batched for
 * the Submissions and Contacts tables.
 *
 * Deliberately separate from getPaidBySubmission, which answers a different question:
 * that one is the ₹199-₹1008 consultation unlock the funnel sells. Two numbers, never
 * added together, because one is a funnel conversion and the other is a sale the
 * operator made by hand.
 */
export async function getProductSalesBySubmission(
  submissionIds: string[],
): Promise<Map<string, { amount: number | null; at: string }>> {
  const map = new Map<string, { amount: number | null; at: string }>();
  if (submissionIds.length === 0) return map;
  const rows = await prisma.payment.findMany({
    where: { submissionId: { in: submissionIds }, purpose: "product_sale", status: "captured" },
    orderBy: { createdAt: "desc" },
    select: { submissionId: true, amount: true, createdAt: true },
  });
  for (const r of rows) {
    if (!r.submissionId || map.has(r.submissionId)) continue; // desc => first is latest
    map.set(r.submissionId, {
      amount: r.amount != null ? r.amount / 100 : null,
      at: r.createdAt.toISOString(),
    });
  }
  return map;
}

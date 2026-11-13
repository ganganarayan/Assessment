import "server-only";
import { prisma } from "@/lib/db/prisma";
import { formatIST } from "@/lib/date";
import { formatMoney } from "@/lib/region/money";
import { TEST_PAYMENT_PURPOSE } from "@/features/payments/test-payment-shared";

/**
 * The paid log on Billing: every successful charge that belongs to this workspace's
 * billing, with the Razorpay payment id a person quotes when they write in.
 *
 * Plan charges (subscription), the owner's plan test charges (subscription_test) and
 * Settings test payments (connection_test). Funnel and product sales are the workspace's
 * own revenue and live on its revenue screens, not here.
 */
const PAID_LOG_PURPOSES = ["subscription", "subscription_test", TEST_PAYMENT_PURPOSE] as const;

const TYPE_LABEL: Record<string, string> = {
  subscription: "Plan payment",
  subscription_test: "Plan test charge",
  [TEST_PAYMENT_PURPOSE]: "Test payment",
};

export interface PaidLogRow {
  id: string;
  /** DD-MM-YYYY HH:MM IST. */
  when: string;
  type: string;
  account: string;
  paymentId: string;
  amount: string;
  currency: string;
  /** Test payments only: did the account's webhook arrive. Null for other rows. */
  webhook: boolean | null;
}

export interface PaidLog {
  rows: PaidLogRow[];
  /** One total per currency, never added across currencies. */
  totals: { currency: string; total: string; count: number }[];
}

/**
 * @param tenantId the workspace, or null for the platform's own keys (whose only rows
 * here are its Settings test payments).
 */
export async function getPaidLog(tenantId: string | null): Promise<PaidLog> {
  const raw = await prisma.payment.findMany({
    where:
      tenantId === null
        ? { tenantId: null, purpose: TEST_PAYMENT_PURPOSE, status: "captured" }
        : { tenantId, purpose: { in: [...PAID_LOG_PURPOSES] }, status: "captured" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: {
      id: true,
      createdAt: true,
      purpose: true,
      providerAccount: true,
      providerPaymentId: true,
      amount: true,
      currency: true,
      notes: true,
    },
  });

  const sums = new Map<string, { minor: number; count: number }>();
  const rows: PaidLogRow[] = raw.map((p) => {
    const currency = (p.currency || "INR").toUpperCase();
    const minor = p.amount ?? 0;
    const s = sums.get(currency) ?? { minor: 0, count: 0 };
    sums.set(currency, { minor: s.minor + minor, count: s.count + 1 });
    const notes =
      p.notes && typeof p.notes === "object" && !Array.isArray(p.notes)
        ? (p.notes as Record<string, unknown>)
        : {};
    return {
      id: p.id,
      when: formatIST(p.createdAt),
      type: TYPE_LABEL[p.purpose] ?? p.purpose,
      account: p.providerAccount === "NON_GST" ? "Non-GST" : p.purpose === TEST_PAYMENT_PURPOSE ? "GST" : "Platform",
      paymentId: p.providerPaymentId ?? "-",
      amount: formatMoney(minor, currency),
      currency,
      webhook: p.purpose === TEST_PAYMENT_PURPOSE ? typeof notes.webhookAt === "string" : null,
    };
  });

  const totals = [...sums.entries()].map(([currency, s]) => ({
    currency,
    total: formatMoney(s.minor, currency),
    count: s.count,
  }));

  return { rows, totals };
}

import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, PLAN_LABEL } from "@/lib/billing/plans";
import { defaultTestPrice, TEST_PRICE_BOUNDS } from "@/lib/billing/razorpay-subscriptions";
import { PAYMENT_TEST_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { formatIST, formatISTDate } from "@/lib/date";
import { TestPaymentsTable, type TestPaymentsState } from "@/features/billing/components/test-payments-table";
import { getPaidLog } from "@/features/billing/data/paid-log";
import { PaidLogTable } from "@/features/billing/components/paid-log-table";

export const dynamic = "force-dynamic";

/**
 * Super admin, Payments, Test payments: platform payments tested end to end with real
 * money, no workspace to pick. One row per plan with INR or USD and a typed amount;
 * Subscribe / Upgrade charge now, Downgrade switches with no charge today, Cancel stops
 * it at once. Everything bills the hidden test workspace (PAYMENT_TEST_TENANT_ID).
 */
export default async function TestPaymentsPage() {
  const user = await requireSuperAdmin();

  const exists = await prisma.tenant.findUnique({ where: { id: PAYMENT_TEST_TENANT_ID }, select: { id: true } });

  let state: TestPaymentsState = { plan: null, status: null, renewsAt: null, emailTo: user.email ?? null };
  let payments: { id: string; when: string; plan: string; amount: string; ref: string }[] = [];

  if (exists) {
    const [resolved, sub, rows] = await Promise.all([
      resolvePlan(PAYMENT_TEST_TENANT_ID),
      prisma.subscription.findUnique({ where: { tenantId: PAYMENT_TEST_TENANT_ID }, select: { renewsAt: true, status: true } }),
      prisma.payment.findMany({
        where: { tenantId: PAYMENT_TEST_TENANT_ID, purpose: { in: ["subscription", "subscription_test"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, createdAt: true, plan: true, amount: true, currency: true, providerPaymentId: true },
      }),
    ]);
    state = {
      plan: resolved.status === "ACTIVE" || resolved.status === "PAST_DUE" ? resolved.plan : null,
      status: sub?.status ?? null,
      renewsAt: sub?.renewsAt ? formatISTDate(sub.renewsAt) : null,
      emailTo: user.email ?? null,
    };
    payments = rows.map((r) => ({
      id: r.id,
      when: formatIST(r.createdAt),
      plan: r.plan ?? "",
      amount: r.amount != null ? `${r.currency} ${(r.amount / 100).toFixed(2)}` : "",
      ref: r.providerPaymentId ?? "",
    }));
  }

  const platformLog = await getPaidLog(null);

  const plans = PLAN_IDS.map((id) => ({
    id,
    label: PLAN_LABEL[id],
    defaults: {
      INR: (defaultTestPrice(id, "INR").minor / 100).toFixed(2),
      USD: (defaultTestPrice(id, "USD").minor / 100).toFixed(2),
    },
  }));
  const bounds = {
    INR: { min: TEST_PRICE_BOUNDS.INR.min / 100, max: TEST_PRICE_BOUNDS.INR.max / 100 },
    USD: { min: TEST_PRICE_BOUNDS.USD.min / 100, max: TEST_PRICE_BOUNDS.USD.max / 100 },
  };

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Test payments</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Real money on the platform GST Razorpay account, run end to end: checkout, the subscription
          webhook, the plan switching on, and the email. Pick INR or USD and type the amount on each
          plan. Subscribe and Upgrade charge now. Downgrade switches the plan with no charge today and
          bills its amount from the next renewal. Cancel stops it at once. Charges go on a hidden test
          workspace, never reach Meta and stay off the Revenue page. They renew monthly until cancelled.
          Downgrade needs a card payment: Razorpay does not allow a plan change on a UPI subscription.
        </p>
      </div>
      <TestPaymentsTable state={state} plans={plans} bounds={bounds} payments={payments} />
      {/* The platform keys' own Settings test payments (GST and Non-GST). */}
      <PaidLogTable log={platformLog} title="Paid log (platform account test payments)" />
    </div>
  );
}

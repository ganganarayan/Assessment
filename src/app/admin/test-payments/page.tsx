import { requireSuperAdmin } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { resolvePlan } from "@/lib/billing/entitlements";
import { PLAN_IDS, PLAN_LABEL } from "@/lib/billing/plans";
import { TEST_AMOUNT_PAISE } from "@/lib/billing/razorpay-subscriptions";
import { PLATFORM_TENANT_ID } from "@/lib/tenant/platform-tenant";
import { formatIST, formatISTDate } from "@/lib/date";
import { TestPaymentsTable } from "@/features/billing/components/test-payments-table";

export const dynamic = "force-dynamic";

/**
 * Super admin, Payments, Test payments: one row per plan with Subscribe / Upgrade at the
 * tier's test amount (INR 1.10 to 1.40), Downgrade with no charge, and Cancel. Real
 * Razorpay money on the platform account, the real activation, real emails.
 */
export default async function TestPaymentsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  await requireSuperAdmin();
  const sp = await searchParams;

  const tenants = await prisma.tenant.findMany({
    where: { deletedAt: null, unlimited: false, agencyAdminTenantId: null, id: { not: PLATFORM_TENANT_ID } },
    orderBy: { name: "asc" },
    select: { id: true, name: true, slug: true },
  });
  const selected = tenants.find((t) => t.id === sp.t) ?? null;

  let state: {
    plan: string | null;
    status: string | null;
    parked: boolean;
    trialing: boolean;
    renewsAt: string | null;
    ownerEmail: string | null;
  } | null = null;
  let payments: { id: string; when: string; plan: string; amount: string; ref: string }[] = [];

  if (selected) {
    const [resolved, sub, owner, rows] = await Promise.all([
      resolvePlan(selected.id),
      prisma.subscription.findUnique({ where: { tenantId: selected.id }, select: { renewsAt: true } }),
      prisma.user.findFirst({
        where: { tenantId: selected.id, deletedAt: null, staffPermission: null },
        orderBy: { createdAt: "asc" },
        select: { email: true },
      }),
      prisma.payment.findMany({
        where: { tenantId: selected.id, purpose: { in: ["subscription", "subscription_test"] } },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: { id: true, createdAt: true, plan: true, amount: true, currency: true, providerPaymentId: true },
      }),
    ]);
    state = {
      plan: resolved.plan,
      status: resolved.status,
      parked: resolved.parked,
      trialing: resolved.trialing,
      renewsAt: sub?.renewsAt ? formatISTDate(sub.renewsAt) : null,
      ownerEmail: owner?.email ?? null,
    };
    payments = rows.map((r) => ({
      id: r.id,
      when: formatIST(r.createdAt),
      plan: r.plan ?? "",
      amount: r.amount != null ? `${r.currency} ${(r.amount / 100).toFixed(2)}` : "",
      ref: r.providerPaymentId ?? "",
    }));
  }

  const plans = PLAN_IDS.map((id) => ({
    id,
    label: PLAN_LABEL[id],
    amountText: `INR ${(TEST_AMOUNT_PAISE[id] / 100).toFixed(2)}`,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Test payments</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          Real charges on the platform Razorpay account at a small amount per plan, so each line on your
          statement says which plan it was. Subscribe and Upgrade charge now. Downgrade switches the plan
          with no charge today and bills the lower amount from the next renewal. Cancel stops it at once.
          The workspace owner gets an email for each. Test charges never reach Meta and stay off the
          Revenue page. They renew monthly until cancelled. Downgrade needs a card payment: Razorpay
          does not allow a plan change on a UPI subscription.
        </p>
      </div>
      <TestPaymentsTable
        tenants={tenants.map((t) => ({ id: t.id, label: `${t.name} (${t.slug})` }))}
        selectedId={selected?.id ?? null}
        state={state}
        plans={plans}
        payments={payments}
      />
    </div>
  );
}

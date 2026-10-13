import { notFound } from "next/navigation";
import { type Metadata } from "next";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { paymentsAllowed } from "@/lib/payments/enabled";
import { resolveRazorpayAccount, resolvePaymentLinkDescription, asRazorpayAccount } from "@/lib/settings/config";
import { isRazorpayConfigured } from "@/lib/payments/razorpay";
import { PayForm } from "@/features/payments/components/pay-form";

/**
 * /pay/<token> - the page a client opens from a link the operator sent by hand.
 *
 * Their name, email and phone are already filled in (so nobody retypes anything into
 * a payment form), and the amount is prefilled but EDITABLE, which is the one thing a
 * Razorpay payment link cannot do.
 *
 * One link, one payment: once it settles the page stops accepting money and says so,
 * and the operator generates the next link when the next amount is due. There is no
 * time expiry, because an unpaid link is harmless and a dead link is not.
 */

export const dynamic = "force-dynamic";

// A money page with a per-person token in the URL has no business in a search index.
export const metadata: Metadata = {
  title: "Payment",
  robots: { index: false, follow: false },
};

/** One centred card, which is the whole layout. Mobile first: this arrives on phones. */
function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-4 py-10">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  );
}

/** A read-only detail line - what we already know about them, shown not asked. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-[var(--muted-foreground)]">{label}</span>
      <span className="min-w-0 break-words text-right font-medium">{value}</span>
    </div>
  );
}

export default async function PayPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  const link = await prisma.paymentLink.findUnique({
    where: { token },
    select: {
      id: true,
      tenantId: true,
      account: true,
      amountPaise: true,
      minPaise: true,
      status: true,
      description: true,
      paidPaise: true,
      submissionId: true,
    },
  });
  if (!link) notFound();

  const [sub, tenant, standingDescription] = await Promise.all([
    prisma.submission.findUnique({
      where: { id: link.submissionId },
      select: {
        leadFirstName: true,
        leadLastName: true,
        leadEmail: true,
        leadMobile: true,
        assessment: { select: { title: true } },
      },
    }),
    link.tenantId
      ? prisma.tenant.findUnique({ where: { id: link.tenantId }, select: { name: true } })
      : Promise.resolve(null),
    resolvePaymentLinkDescription(link.tenantId),
  ]);

  const payee = tenant?.name?.trim() || "Assess360";
  const name = [sub?.leadFirstName, sub?.leadLastName].filter(Boolean).join(" ").trim();
  const what =
    link.description?.trim() ||
    standingDescription ||
    (sub?.assessment?.title ? `Payment - ${sub.assessment.title}` : "Payment");

  // Settled: the verify route sends them back here with ?paid=1, and a revisit of a
  // spent link lands in the same place. Showing the amount is the receipt.
  if (link.status === "PAID") {
    const paid = link.paidPaise != null ? link.paidPaise / 100 : null;
    return (
      <Shell title="Payment received">
        <p className="text-sm">
          Thank you{name ? `, ${name.split(" ")[0]}` : ""}. {payee} has received
          {paid != null ? ` ₹${paid.toLocaleString("en-IN")}` : " your payment"}.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          Razorpay has emailed you the receipt. This link is now closed - ask {payee} for a new one if
          there is anything further to pay.
        </p>
      </Shell>
    );
  }

  if (link.status === "CANCELLED") {
    return (
      <Shell title="Link withdrawn">
        <p className="text-sm">This payment link is no longer valid. Please ask {payee} for a current one.</p>
      </Shell>
    );
  }

  // Both of these are the same message to the client, for two different reasons on our
  // side: the owner has switched payments off, or the account has no keys. Either way
  // the honest thing is to say it cannot take money rather than fail at the last step.
  const keys = await resolveRazorpayAccount(link.tenantId, asRazorpayAccount(link.account));
  const canTakeMoney = (await paymentsAllowed(link.tenantId)) && isRazorpayConfigured(keys);
  if (!canTakeMoney) {
    return (
      <Shell title="Payment unavailable">
        <p className="text-sm">
          This link cannot take payments at the moment. Please contact {payee} and they will send a new one.
        </p>
      </Shell>
    );
  }

  return (
    <Shell title={`Pay ${payee}`}>
      {sp.paid === "0" ? (
        <p className="rounded-md border-l-2 border-amber-500 bg-amber-500/5 px-3 py-2 text-xs">
          That payment did not go through. Nothing has been charged - you can try again below.
        </p>
      ) : null}
      <p className="text-sm text-[var(--muted-foreground)]">{what}</p>
      <div className="flex flex-col gap-1 rounded-md border p-3">
        {name ? <Detail label="Name" value={name} /> : null}
        {sub?.leadEmail ? <Detail label="Email" value={sub.leadEmail} /> : null}
        {sub?.leadMobile ? <Detail label="Phone" value={sub.leadMobile} /> : null}
      </div>
      <PayForm token={token} suggested={link.amountPaise / 100} minAmount={link.minPaise / 100} />
    </Shell>
  );
}

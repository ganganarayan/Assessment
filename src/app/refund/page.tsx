import type { Metadata } from "next";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P, UL } from "@/components/marketing/LegalShell";

// NOTE: Standard India-focused SaaS refund/cancellation boilerplate. Company specifics come from
// super-admin Settings → "Legal & company details". Have counsel review before relying on it.
export const dynamic = "force-dynamic";

const UPDATED = "September 2026";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Refund & Cancellation Policy", description: "How billing, cancellations and refunds work." };
}

export default async function RefundPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Refund &amp; Cancellation Policy" updated={UPDATED}>
      <P>
        This policy explains how billing, cancellations and refunds work for {c.brand}, operated by
        {" "}{c.entityName}.
      </P>

      <H2>1. Free plan</H2>
      <P>The free plan is free and requires no payment, so no refunds apply to it.</P>

      <H2>2. Paid subscriptions</H2>
      <UL>
        <li>Paid plans, where offered, are billed in advance for the chosen billing period (for example monthly).</li>
        <li>Prices are shown in USD and are exclusive of applicable taxes, which are added where required.</li>
        <li>Your subscription renews automatically until you cancel.</li>
      </UL>

      <H2>3. Cancellation</H2>
      <P>
        You can cancel at any time from your account. Cancellation stops future renewals; your paid
        features remain available until the end of the current billing period, after which the account
        moves to the free plan.
      </P>

      <H2>4. Refunds</H2>
      <UL>
        <li>Fees already paid for the current period are generally non-refundable, except where required by law.</li>
        <li>If you were charged due to a clear technical error or a duplicate charge, contact us and we will investigate and refund an incorrect charge.</li>
        <li>Approved refunds are made to the original payment method through our payment processor and may take several business days to appear.</li>
      </UL>

      <H2>5. How to request</H2>
      <P>
        To cancel with a refund request, or to report a billing issue, email{" "}
        <a href={`mailto:${email}`}>{email}</a> from your account email with your account details and
        the charge in question.
      </P>

      <H2>6. Contact</H2>
      <P>
        {c.entityName}, {c.address}. Billing questions:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </P>
    </LegalShell>
  );
}

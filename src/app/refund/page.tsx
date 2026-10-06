import type { Metadata } from "next";
import { platformPageMetadata } from "@/lib/seo/site";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P, UL } from "@/components/marketing/LegalShell";
import { PLAN_LABEL, TRIAL_DAYS, TRIAL_PLAN } from "@/lib/billing/plans";

// NOTE: Standard India-focused SaaS refund/cancellation boilerplate. Company specifics come from
// super-admin Settings → "Legal & company details". Have counsel review before relying on it.
export const dynamic = "force-dynamic";

const UPDATED = "October 2026";

// Trial facts come from the billing catalog, never retyped. This page previously described a
// free plan that had already been removed from PLAN_IDS, and the contradiction sat on a public
// legal page for weeks. Importing keeps the policy honest when the catalog changes.
const TRIAL_LABEL = PLAN_LABEL[TRIAL_PLAN];

export async function generateMetadata(): Promise<Metadata> {
  // Shared helper so the canonical is never forgotten: this page is served on the
  // platform domain AND on every tenant subdomain and custom domain, and it is the
  // platform's policy in all of them.
  return platformPageMetadata({
    title: "Refund & Cancellation Policy",
    description:
      "Payments are non-refundable. Cancel before the renewal date to stop billing, and keep access until the period you paid for ends.",
    path: "/refund",
  });
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

      <H2>1. Free trial</H2>
      <P>
        A new workspace starts on a free {TRIAL_DAYS}-day {TRIAL_LABEL} trial. It takes no card and
        no payment, so no refunds apply to it. When the trial ends, the workspace is paused until you
        choose a paid plan - see section 3.
      </P>

      <H2>2. Paid subscriptions</H2>
      <UL>
        <li>Paid plans are billed in advance for the chosen billing period (for example monthly).</li>
        <li>Prices are shown in USD and are exclusive of applicable taxes, which are added where required.</li>
        <li>Your subscription renews automatically on the renewal date until you cancel.</li>
        <li>You are never charged for a period that begins after your cancellation takes effect.</li>
      </UL>

      <H2>3. Cancellation and renewal</H2>
      <P>
        You can cancel at any time from your account. You keep full access to everything you have
        already paid for until the end of the current billing period - cancelling does not cut your
        access short, and it does not take effect mid-period.
      </P>
      <P>
        <strong>Cancel before the renewal date and you are not charged again.</strong> There are no
        further charges once the current period ends: the subscription simply stops renewing. This is
        how you end your billing with us, and it is why there is nothing to refund afterwards.
      </P>
      <P>
        At the end of that period the workspace is paused. Paused means read-only: your assessments stop accepting new responses and results are
        withheld, while your assessments, responses and settings are kept. Nothing is deleted when a
        workspace is paused, and choosing a plan again resumes it exactly where it left off.
      </P>

      <H2>4. No refunds</H2>
      <P>
        <strong>Payments are non-refundable.</strong> Once a billing period has started it is not
        refundable, in whole or in part. We do not pro-rate or refund:
      </P>
      <UL>
        <li>a period you cancelled part-way through;</li>
        <li>time left over at the end of a period;</li>
        <li>a period you used little or not at all;</li>
        <li>a renewal you intended to cancel but did not cancel before the renewal date.</li>
      </UL>
      <P>
        Cancelling before the renewal date is the way to avoid the next charge. Because you keep the
        full period you paid for and are not charged beyond it, a refund is not part of how this
        works.
      </P>

      <H2>5. Charges made in error</H2>
      <P>
        A billing mistake is not a refund request, and we do correct it. Tell us if you were charged
        twice for the same period, charged after your cancellation had already taken effect, or
        charged through a clear technical fault, and we will reverse the incorrect amount. We also
        refund where a refund is required by law. Reversals go back to the original payment method
        through our payment processor and can take several business days to appear.
      </P>

      <H2>6. How to reach us about billing</H2>
      <P>
        To report a charge made in error or ask a billing question, email{" "}
        <a href={`mailto:${email}`}>{email}</a> from your account email with your account details and
        the charge in question. To cancel, use your account - cancellation does not require emailing
        us.
      </P>

      <H2>7. Contact</H2>
      <P>
        {c.entityName}, {c.address}. Billing questions:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </P>
    </LegalShell>
  );
}

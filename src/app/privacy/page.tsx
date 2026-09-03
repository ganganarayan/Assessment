import type { Metadata } from "next";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P, UL } from "@/components/marketing/LegalShell";

// NOTE: Standard India-focused (DPDP-aware) SaaS boilerplate. Company specifics come from
// super-admin Settings → "Legal & company details". Have counsel review before relying on it.
export const dynamic = "force-dynamic";

const UPDATED = "September 2026";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Privacy Policy", description: "How we collect, use and protect personal data." };
}

export default async function PrivacyPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Privacy Policy" updated={UPDATED}>
      <P>
        This Privacy Policy explains how {c.entityName} (&ldquo;we&rdquo;, &ldquo;us&rdquo;), which
        operates {c.brand}, handles personal data. It is intended to be consistent with India&rsquo;s
        Digital Personal Data Protection Act, 2023 and applicable rules.
      </P>

      <H2>1. Who we are</H2>
      <P>
        {c.entityName}, {c.address}. For account holders we are the data fiduciary. For the responses
        our customers collect through their assessments, our customer is the data fiduciary and we act
        as a data processor on their instructions.
      </P>

      <H2>2. Information we collect</H2>
      <UL>
        <li><strong>Account data:</strong> name, email, and login credentials.</li>
        <li><strong>Usage data:</strong> log, device and analytics data about how the Service is used.</li>
        <li><strong>Billing data:</strong> processed by our payment processor; we do not store full card details.</li>
        <li><strong>Respondent data:</strong> the answers and contact details end-users submit to our customers&rsquo; assessments, processed on the customer&rsquo;s behalf.</li>
      </UL>

      <H2>3. How we use personal data</H2>
      <UL>
        <li>to provide, secure, and improve the Service;</li>
        <li>to process payments and manage your account;</li>
        <li>to communicate service, security and (where permitted) product updates;</li>
        <li>to comply with legal obligations.</li>
      </UL>

      <H2>4. Legal basis &amp; consent</H2>
      <P>
        We process personal data on the basis of your consent and for the legitimate uses permitted
        by law, including performing our contract with you. You may withdraw consent at any time,
        which may limit some features.
      </P>

      <H2>5. Sharing &amp; processors</H2>
      <P>We share data only as needed to run the Service, with providers such as:</P>
      <UL>
        <li>cloud hosting and file storage;</li>
        <li>a payment processor (Razorpay) for billing;</li>
        <li>advertising/analytics (Meta) and AI providers (OpenAI, Anthropic, Google) where you enable them;</li>
        <li>authorities where required by law.</li>
      </UL>

      <H2>6. Cookies &amp; tracking</H2>
      <P>
        We use necessary cookies to run the Service and, where enabled, analytics or advertising
        tags. You can control non-essential cookies through your browser or the on-site controls.
      </P>

      <H2>7. Data retention</H2>
      <P>
        We keep personal data for as long as your account is active or as needed to provide the
        Service, then delete or anonymise it unless a longer period is required by law.
      </P>

      <H2>8. Security</H2>
      <P>
        We use reasonable technical and organisational measures, including encryption of sensitive
        secrets at rest. No method of transmission or storage is completely secure.
      </P>

      <H2>9. Your rights</H2>
      <P>
        Subject to law, you may request access to, correction of, or erasure of your personal data,
        and may nominate another person to exercise your rights. To make a request, contact us below.
      </P>

      <H2>10. Grievance Officer</H2>
      <P>
        For privacy questions or complaints, contact our Grievance Officer at{" "}
        <a href={`mailto:${email}`}>{email}</a>, {c.entityName}, {c.address}. We will respond within
        the timelines required by law.
      </P>

      <H2>11. Children</H2>
      <P>
        The Service is not directed to children, and we do not knowingly process a child&rsquo;s
        personal data without verifiable parental consent as required by law.
      </P>

      <H2>12. Changes</H2>
      <P>
        We may update this Policy from time to time. Material changes will be notified through the
        Service or by email.
      </P>
    </LegalShell>
  );
}

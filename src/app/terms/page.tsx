import type { Metadata } from "next";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P, UL } from "@/components/marketing/LegalShell";

// NOTE: Standard India-focused SaaS boilerplate. Company specifics come from the
// super-admin Settings → "Legal & company details". Have counsel review before relying on it.
export const dynamic = "force-dynamic";

const UPDATED = "September 2026";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Terms of Service", description: "The terms governing use of the service." };
}

export default async function TermsPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Terms of Service" updated={UPDATED}>
      <P>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of {c.brand}
        {" "}(the &ldquo;Service&rdquo;), operated by {c.entityName} (&ldquo;we&rdquo;,
        &ldquo;us&rdquo;). By creating an account or using the Service, you agree to these Terms.
        If you do not agree, do not use the Service.
      </P>

      <H2>1. The Service</H2>
      <P>
        {c.brand} lets you build scored assessments, publish them on a hosted link or your own
        domain, collect and score responses, and route the results. Features available to you
        depend on your plan.
      </P>

      <H2>2. Accounts &amp; eligibility</H2>
      <P>
        You must provide accurate information and are responsible for activity under your account
        and for keeping your credentials secure. You must be able to form a binding contract to
        use the Service.
      </P>

      <H2>3. Plans, billing &amp; taxes</H2>
      <UL>
        <li>A free plan is available. Paid plans, where offered, are billed in advance on a recurring basis until cancelled.</li>
        <li>Prices are displayed in USD and are exclusive of applicable taxes (including GST), which are added where required.</li>
        <li>You authorise us and our payment processor to charge your chosen payment method for each billing period.</li>
        <li>Plan limits (such as monthly responses, assessments and seats) apply as described at sign-up and on the pricing page.</li>
      </UL>

      <H2>4. Acceptable use</H2>
      <P>You agree not to use the Service to:</P>
      <UL>
        <li>break any law, or infringe the rights of others;</li>
        <li>collect sensitive personal data without a lawful basis and proper notice;</li>
        <li>send spam, malware, or attempt to disrupt or reverse-engineer the Service;</li>
        <li>resell or provide the Service to third parties except as your plan permits.</li>
      </UL>

      <H2>5. Your content and your respondents</H2>
      <P>
        You retain ownership of the assessments you create and the response data you collect
        (&ldquo;Your Content&rdquo;). You are the controller of your respondents&rsquo; personal
        data; we process it on your behalf to provide the Service. You are responsible for having
        a lawful basis and privacy notice for the data you collect. You grant us the limited rights
        needed to host and process Your Content to run the Service.
      </P>

      <H2>6. Third-party services</H2>
      <P>
        The Service integrates optional third parties you choose to enable — for example a payment
        processor (Razorpay), advertising and analytics tools (Meta), and AI providers (OpenAI,
        Anthropic, Google). Your use of those is subject to their terms, and you are responsible for
        the keys and accounts you connect.
      </P>

      <H2>7. Intellectual property</H2>
      <P>
        The Service, including its software, design and trademarks, is owned by {c.entityName} and
        its licensors. These Terms grant you no rights in it except the right to use it per your plan.
      </P>

      <H2>8. Disclaimers &amp; limitation of liability</H2>
      <P>
        The Service is provided &ldquo;as is&rdquo; without warranties of any kind to the extent
        permitted by law. To the maximum extent permitted by law, our total liability arising out of
        or relating to the Service is limited to the amount you paid us in the three months before
        the event giving rise to the claim. We are not liable for indirect or consequential losses.
      </P>

      <H2>9. Termination</H2>
      <P>
        You may stop using the Service and cancel at any time. We may suspend or terminate access for
        breach of these Terms or to comply with law. On termination, your right to use the Service
        ends; provisions that by their nature should survive will survive.
      </P>

      <H2>10. Governing law &amp; jurisdiction</H2>
      <P>
        These Terms are governed by the laws of India. The courts at {c.governingLocation} shall have
        exclusive jurisdiction over any dispute, subject to applicable law.
      </P>

      <H2>11. Changes</H2>
      <P>
        We may update these Terms from time to time. Material changes will be notified through the
        Service or by email. Continued use after changes take effect means you accept them.
      </P>

      <H2>12. Contact</H2>
      <P>
        {c.entityName}, {c.address}. Questions about these Terms:{" "}
        <a href={`mailto:${email}`}>{email}</a>.
      </P>
    </LegalShell>
  );
}

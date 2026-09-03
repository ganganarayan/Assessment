import type { Metadata } from "next";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P } from "@/components/marketing/LegalShell";

// Company specifics come from super-admin Settings → "Legal & company details".
export const dynamic = "force-dynamic";

const UPDATED = "September 2026";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Contact Us", description: "How to reach us for support and enquiries." };
}

export default async function ContactPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Contact Us" updated={UPDATED}>
      <P>
        We&rsquo;d love to hear from you. For support, billing, or any question about {c.brand},
        reach us using the details below and we&rsquo;ll get back to you as soon as we can.
      </P>

      <H2>Email</H2>
      <P>
        <a href={`mailto:${email}`}>{email}</a>
      </P>

      <H2>Registered office</H2>
      <P>
        {c.entityName}
        <br />
        {c.address}
      </P>

      <H2>Support hours</H2>
      <P>Monday to Friday, 10:00–18:00 IST (excluding public holidays).</P>
    </LegalShell>
  );
}

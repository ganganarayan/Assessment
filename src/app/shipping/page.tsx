import type { Metadata } from "next";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P } from "@/components/marketing/LegalShell";

// Digital service — no physical shipping. This page exists because Indian payment
// gateways require a shipping/delivery policy even for software/SaaS.
export const dynamic = "force-dynamic";

const UPDATED = "September 2026";

export async function generateMetadata(): Promise<Metadata> {
  return { title: "Shipping & Delivery Policy", description: "How the service is delivered — a digital product, no physical shipping." };
}

export default async function ShippingPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Shipping &amp; Delivery Policy" updated={UPDATED}>
      <P>
        {c.brand} is a software-as-a-service product delivered entirely online. There is{" "}
        <strong>no physical shipping</strong> of any goods.
      </P>

      <H2>How the service is delivered</H2>
      <P>
        Access is provided electronically. When you create an account, your workspace is available
        immediately. When you subscribe to a paid plan, the corresponding features are enabled on
        your account as soon as payment is confirmed — typically within a few minutes.
      </P>

      <H2>No physical goods</H2>
      <P>
        Because {c.brand} is a digital service, nothing is dispatched, couriered, or delivered to a
        physical address, and no shipping charges apply.
      </P>

      <H2>Delivery issues</H2>
      <P>
        If a feature you paid for is not enabled on your account shortly after payment, contact{" "}
        <a href={`mailto:${email}`}>{email}</a> and we&rsquo;ll resolve it. Billing and cancellation
        terms are covered in our Refund &amp; Cancellation Policy.
      </P>

      <H2>Contact</H2>
      <P>
        {c.entityName}, {c.address}. Questions: <a href={`mailto:${email}`}>{email}</a>.
      </P>
    </LegalShell>
  );
}

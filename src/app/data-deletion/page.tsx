import type { Metadata } from "next";
import Link from "next/link";
import { platformPageMetadata } from "@/lib/seo/site";
import { getLegalConfig } from "@/lib/legal/config";
import { LegalShell, H2, P, UL } from "@/components/marketing/LegalShell";

/**
 * The data deletion instructions page.
 *
 * 🔴 IT EXISTS BECAUSE META REQUIRES A URL, and the field is not optional: an app with
 * nothing in "User data deletion" cannot be submitted for App Review, and the settings
 * form refuses to persist at all while it is empty - which is why Privacy Policy URL
 * and Category kept reverting to blank and the page kept reporting the app ineligible.
 * Meta accepts either a callback endpoint it can POST to or a page a person can read.
 * This is the page, which is the honest version: a deletion request here is handled by
 * people, not by an endpoint that would have to pretend it had done something.
 *
 * It is a separate page rather than an anchor into the privacy policy on purpose. The
 * privacy policy mentions erasure in one clause of one section, and a reviewer who
 * cannot see the route in the first screen rejects the URL - which costs days, not
 * minutes. The policy keeps its clause and now links here.
 *
 * Every company-specific fact comes from Settings, like the other policy pages, so a
 * second deployment of this product never shows somebody else's contact address.
 */

// NOTE: India-focused (DPDP-aware) boilerplate, consistent with /privacy. Company
// specifics come from super-admin Settings, "Legal & company details".
export const dynamic = "force-dynamic";

const UPDATED = "October 2026";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Data Deletion",
    description: "How to ask us to delete your personal data, and what happens when you do.",
    path: "/data-deletion",
  });
}

export default async function DataDeletionPage() {
  const c = await getLegalConfig();
  const email = c.contactEmail;
  return (
    <LegalShell title="Data Deletion" updated={UPDATED}>
      <P>
        You can ask {c.entityName}, which operates {c.brand}, to delete the personal data we hold
        about you. This page explains how to ask, what gets deleted, and how long it takes.
      </P>

      <H2>1. How to make a request</H2>
      <P>
        Email <a href={`mailto:${email}`}>{email}</a> from the address on the account, with
        &ldquo;Data deletion request&rdquo; as the subject. Tell us which account or which phone
        number the request is about. If you cannot write from the address on the account, say so and
        we will verify your identity another way before we delete anything.
      </P>
      <P>
        If you hold an account with us, you can also ask from inside the app, and your workspace
        owner can delete respondent records themselves at any time without writing to us.
      </P>

      <H2>2. What we delete</H2>
      <UL>
        <li><strong>Account data:</strong> your name, email, login credentials and settings.</li>
        <li><strong>Assessment responses:</strong> the answers, scores and reports tied to you.</li>
        <li><strong>Contact records:</strong> your email address and phone number, and any
          WhatsApp or email messages we sent you or received from you.</li>
        <li><strong>Connected service data:</strong> anything we stored from a service you
          connected, including a WhatsApp Business account and its message history.</li>
      </UL>

      <H2>3. What we keep, and why</H2>
      <P>
        We keep the minimum the law requires us to keep: invoices and tax records, and records of
        payments. We also keep a note that a deletion request was made and actioned, because we have
        to be able to show that we honoured it. Neither of these is used to contact you.
      </P>
      <P>
        Where data has already been shared with a service you connected yourself, such as a payment
        processor or an advertising platform, deleting it here does not delete it there. We will
        tell you which services were involved so you can ask them directly.
      </P>

      <H2>4. If you are a respondent, not a customer</H2>
      <P>
        If you answered an assessment that somebody else published, that business is the data
        fiduciary for your answers and we hold them on its instructions. Write to us anyway and we
        will pass the request to that business and confirm when it has been actioned. You do not
        need to know who they are, and you do not need an account with us.
      </P>

      <H2>5. How long it takes</H2>
      <P>
        We acknowledge every request within 72 hours and complete deletion within 30 days. Backups
        are overwritten on their own schedule, so a copy can persist in an encrypted backup for up
        to a further 30 days, after which it is gone. Nothing from a deleted account is restored
        from a backup for any purpose other than a legal obligation.
      </P>

      <H2>6. Deleting a WhatsApp connection</H2>
      <P>
        Disconnecting a WhatsApp Business account in the app removes the access token and the stored
        messages from our side immediately. It does not remove anything from your phone, and your
        number keeps working in the WhatsApp Business app exactly as before.
      </P>

      <H2>7. Questions</H2>
      <P>
        Write to <a href={`mailto:${email}`}>{email}</a>, {c.entityName}, {c.address}. Our{" "}
        <Link href="/privacy" className="underline">Privacy Policy</Link> explains what we collect
        and why, and names the Grievance Officer if you want to complain about how a request was
        handled.
      </P>
    </LegalShell>
  );
}

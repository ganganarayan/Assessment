import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { UnsubscribeForm } from "@/features/contacts/components/unsubscribe-form";

export const dynamic = "force-dynamic";

/**
 * The unsubscribe page, reached from the link on every marketing message.
 *
 * 🔴 It does NOT unsubscribe on arrival, and that is the entire design of this file.
 * Corporate mail security scanners fetch every link in an email before the person ever
 * sees it, so a GET that acts would quietly unsubscribe people who never clicked
 * anything. The stop happens on a POST from the button, which a scanner does not press.
 *
 * No login, by necessity: somebody who wants out must not have to get in first.
 */
export default async function UnsubscribePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const contact = await prisma.contact.findUnique({
    where: { optOutToken: token },
    select: { id: true, firstName: true, marketingOptOutAt: true },
  });
  // An unknown token is a 404 rather than a form. Rendering the page anyway would turn
  // it into somewhere to test guesses.
  if (!contact) notFound();

  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-16">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-bold tracking-tight">
          {contact.marketingOptOutAt ? "You are unsubscribed" : "Unsubscribe"}
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {contact.marketingOptOutAt
            ? "You will not receive any more marketing messages from us by email or WhatsApp."
            : "Stop receiving marketing messages from us. This covers both email and WhatsApp, and takes effect immediately."}
        </p>
      </div>

      {contact.marketingOptOutAt ? null : <UnsubscribeForm token={token} />}

      <p className="text-xs text-[var(--muted-foreground)]">
        Messages about something you asked for, such as your own assessment result, are
        not marketing and may still reach you.
      </p>
    </main>
  );
}

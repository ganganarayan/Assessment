import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { WastedCallCalculator } from "@/components/marketing/WastedCallCalculator";
import { platformPageMetadata, platformUrl } from "@/lib/seo/site";
import { MARKETING } from "@/lib/marketing/content";

/**
 * The wasted-call calculator. Ungated, no email, no gate of our own.
 *
 * It would be an obvious lead magnet to put an email wall in front of, and doing so would
 * contradict the argument the rest of the site makes. A visitor who has to pay with their
 * address to learn what their own calendar costs them has learned something about us.
 *
 * The FAQ schema below carries the method, because the question people actually type is
 * "how much does a bad sales call cost" rather than the name of a calculator.
 */
export const dynamic = "force-dynamic";

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "How much does a wrong-fit sales call actually cost?",
    a: "Multiply the number of wrong-fit calls you take in a month by their average length, then by what an hour of that person's time is worth. Counting only the call itself and nothing around it, most service businesses taking forty calls a month lose double figures of hours before preparation, notes or follow-up are counted.",
  },
  {
    q: "Does this count preparation and follow-up?",
    a: "No, deliberately. It counts the call and nothing else, so the figure is a floor nobody can argue you down from. Preparation, note-writing, follow-up, reschedules and the context switch either side are all real and all excluded.",
  },
  {
    q: "How do I stop booking wrong-fit calls?",
    a: "Qualify before the opt-in rather than after it. A gate placed before the form routes anyone who cannot pay, is not the decision-maker or is months away to an exit page, so no lead record is created and no call is ever booked, instead of filtering them afterwards once they are already in your CRM.",
  },
];

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Wasted Call Calculator",
    description:
      "Work out what wrong-fit sales calls cost you a month and a year. No email required, and the arithmetic is deliberately conservative.",
    path: "/wasted-call-calculator",
  });
}

export default async function WastedCallCalculatorPage() {
  if (await getCurrentTenant()) notFound();

  const url = platformUrl("/wasted-call-calculator");
  const jsonLd = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebPage",
        "@id": `${url}#webpage`,
        url,
        name: `Wasted Call Calculator - ${MARKETING.name}`,
        inLanguage: "en",
      },
      {
        "@type": "FAQPage",
        "@id": `${url}#faq`,
        mainEntity: FAQ.map((f) => ({
          "@type": "Question",
          name: f.q,
          acceptedAnswer: { "@type": "Answer", text: f.a },
        })),
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Nav anchorBase="/" />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
          What are wrong-fit calls costing you?
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
          Four numbers, no email, and the answer on this page. Most people who fill this in
          already knew the calls were a problem and had never multiplied it out.
        </p>

        <div className="mt-10">
          <WastedCallCalculator />
        </div>

        <section className="mt-14 border-t pt-10">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Questions people ask</h2>
          <div className="mt-5 flex flex-col gap-6">
            {FAQ.map((f) => (
              <div key={f.q}>
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <p className="mt-12 border-t pt-8 text-sm text-[var(--muted-foreground)]">
          This page is hosted on {MARKETING.name} and asks for nothing. That is the same
          posture a scorecard built here takes with your own visitors:{" "}
          <Link href="/" className="underline underline-offset-4">
            say something useful first
          </Link>
          , and let the people it does not suit leave without becoming a lead.
        </p>
      </main>
      <Footer />
    </>
  );
}

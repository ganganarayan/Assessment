import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { DfyOffer } from "@/features/seo/components/dfy-offer";
import { publishedCaseStudies } from "@/content/case-studies";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * The case-study index.
 *
 * 🔴 It 404s while there are none, rather than rendering an empty list. A site whose
 * entire argument is that it can prove things, serving a "Case studies" page with
 * nothing on it, makes the opposite case more effectively than any competitor could.
 * The page appears the day the first one is published and not a day before.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Case studies",
    description:
      "What happened to the lead volume, the calls booked and the close rate after a qualification gate went in front of the opt-in. Real installs, real numbers.",
    path: "/case-studies",
  });
}

export default async function CaseStudiesPage() {
  if (await getCurrentTenant()) notFound();
  const studies = publishedCaseStudies();
  if (studies.length === 0) notFound();

  return (
    <>
      <Nav anchorBase="/" />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">Case studies</h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
          What actually changed after a gate went in front of the opt-in: the lead count, the
          calls booked, and how many of those were worth taking.
        </p>

        <div className="mt-10 flex flex-col gap-4">
          {studies.map((c) => (
            <Link
              key={c.slug}
              href={`/case-studies/${c.slug}`}
              className="rounded-xl border p-5 transition-colors hover:bg-[var(--muted)]"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                {c.industry} · {c.trafficSource}
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-tight">{c.title}</h2>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{c.description}</p>
            </Link>
          ))}
        </div>

        <div className="mt-12">
          <DfyOffer />
        </div>
      </main>
      <Footer />
    </>
  );
}

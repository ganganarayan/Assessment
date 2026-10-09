import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { DfyOffer } from "@/features/seo/components/dfy-offer";
import { caseStudyBySlug, publishedCaseStudies } from "@/content/case-studies";
import { platformPageMetadata, platformUrl } from "@/lib/seo/site";
import type { Metrics } from "@/lib/case-studies/types";

/**
 * One case study.
 *
 * 🔴 The before/after table prints only the rows the customer actually gave us. A
 * template that insists on every field produces either blanks or, far worse, invented
 * numbers attached to a named business. A missing metric is simply a row that is not
 * there.
 */
export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return publishedCaseStudies().map((c) => ({ slug: c.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const c = caseStudyBySlug(slug);
  if (!c) return {};
  return platformPageMetadata({
    title: c.title,
    description: c.description,
    path: `/case-studies/${c.slug}`,
  });
}

const ROWS: ReadonlyArray<{ key: keyof Metrics; label: string; suffix?: string }> = [
  { key: "leadsPerMonth", label: "Leads a month" },
  { key: "callsBooked", label: "Calls booked" },
  { key: "wrongFitCalls", label: "Of those, wrong-fit" },
  { key: "closeRatePct", label: "Close rate", suffix: "%" },
];

export default async function CaseStudyPage({ params }: { params: Promise<{ slug: string }> }) {
  if (await getCurrentTenant()) notFound();
  const { slug } = await params;
  const c = caseStudyBySlug(slug);
  if (!c) notFound();

  const url = platformUrl(`/case-studies/${c.slug}`);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: c.title,
    description: c.description,
    url,
    dateModified: c.updatedAt,
    inLanguage: "en",
  };

  const rows = ROWS.filter((r) => c.before[r.key] !== undefined || c.after[r.key] !== undefined);

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <Nav anchorBase="/" />
      <main id="main" className="mx-auto w-full max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
          {c.industry} · {c.trafficSource} · {c.adSpendBand}
        </p>
        <h1 className="mt-3 text-3xl font-bold leading-tight tracking-tight sm:text-4xl">{c.title}</h1>
        <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">{c.description}</p>

        {rows.length > 0 ? (
          <div className="mt-10 overflow-hidden rounded-lg border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[var(--muted)] text-left">
                  <th scope="col" className="px-4 py-3 font-semibold">
                    &nbsp;
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Before
                  </th>
                  <th scope="col" className="px-4 py-3 font-semibold">
                    After
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={String(r.key)} className="border-t">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      {r.label}
                    </th>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">
                      {fmt(c.before[r.key], r.suffix)}
                    </td>
                    <td className="px-4 py-3 font-semibold">{fmt(c.after[r.key], r.suffix)}</td>
                  </tr>
                ))}
                {c.after.costPerQualifiedLead ? (
                  <tr className="border-t">
                    <th scope="row" className="px-4 py-3 text-left font-medium">
                      Cost per qualified lead
                    </th>
                    <td className="px-4 py-3 text-[var(--muted-foreground)]">Not tracked</td>
                    <td className="px-4 py-3 font-semibold">{c.after.costPerQualifiedLead}</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        ) : null}

        <blockquote className="mt-10 border-l-2 border-green-600 pl-5">
          <p className="text-lg leading-relaxed">{c.quote}</p>
          {c.quoteAttribution ? (
            <footer className="mt-2 text-sm text-[var(--muted-foreground)]">
              {c.quoteAttribution}, {c.client}
            </footer>
          ) : null}
        </blockquote>

        <div className="mt-10 flex flex-col gap-4">
          {c.body.map((p) => (
            <p key={p} className="leading-relaxed text-[var(--muted-foreground)]">
              {p}
            </p>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">
            The gate questions they used
          </h2>
          <ul className="mt-4 flex flex-col gap-2">
            {c.gateQuestions.map((q) => (
              <li key={q} className="rounded-lg border px-4 py-3 text-[var(--muted-foreground)]">
                {q}
              </li>
            ))}
          </ul>
        </section>

        {c.scorecardImage || c.resultImage ? (
          <section className="mt-12 grid gap-4 sm:grid-cols-2">
            {c.scorecardImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.scorecardImage}
                alt={`The live scorecard for ${c.client}`}
                className="w-full rounded-xl border"
              />
            ) : null}
            {c.resultImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={c.resultImage}
                alt={`The result page for ${c.client}`}
                className="w-full rounded-xl border"
              />
            ) : null}
          </section>
        ) : null}

        <div className="mt-12">
          <DfyOffer />
        </div>
      </main>
      <Footer />
    </>
  );
}

function fmt(v: number | string | undefined, suffix?: string): string {
  if (v === undefined) return "-";
  return typeof v === "number" ? `${v.toLocaleString()}${suffix ?? ""}` : v;
}

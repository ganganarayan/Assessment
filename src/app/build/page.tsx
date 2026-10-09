import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { BuildForm } from "@/components/marketing/BuildForm";
import { DFY, OFFER } from "@/lib/marketing/content";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * The done-for-you intake, and the destination of the home page's primary call to action.
 *
 * Platform-only, like every other marketing route: a tenant's own domain serves their
 * funnel, and an Assess360 sales page appearing on a customer's branded host would be
 * our offer sitting inside their brand.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Get my scorecard built free",
    description:
      "Tell us what you sell and who wastes your time. We build the scorecard, then take it live with you on one 30-minute call: pixel, Conversions API, audiences, custom domain, test events.",
    path: "/build",
  });
}

export default async function BuildPage() {
  if (await getCurrentTenant()) notFound();

  return (
    <>
      <Nav />
      <main id="main">
        <section className="border-b">
          <div className="mx-auto max-w-2xl px-5 py-16 sm:px-8 sm:py-20">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              {DFY.heading}
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              {DFY.body}
            </p>
            <p className="mt-4 font-medium">{OFFER.ctaSubline}</p>

            <ol className="mt-8 flex flex-col gap-3 text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">1.</strong> You fill this in. It
                takes about four minutes.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">2. You send us a brief.</strong> A
                short form before the call, so we arrive already knowing your offer, your price
                and who has been wasting your time.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">3. 30 minutes, live.</strong> We
                set your workspace up, lay the scorecard in and tweak the gate with you, connect
                your Meta pixel and the Conversions API, and build the exclusion and retargeting
                audiences in your ad account.
              </li>
            </ol>

            <div className="mt-10">
              <BuildForm />
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

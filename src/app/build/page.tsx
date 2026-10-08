import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { BuildForm } from "@/components/marketing/BuildForm";
import { DFY } from "@/lib/marketing/content";
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
    title: "Get your scorecard built free in 24 hours",
    description:
      "Tell us what you sell and who wastes your time. We write the gate, the questions, the weights and the result bands, wire the Meta events, and hand you a live link within 24 hours.",
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

            <ol className="mt-8 flex flex-col gap-3 text-[var(--muted-foreground)]">
              <li>
                <strong className="text-[var(--foreground)]">1.</strong> You fill this in. It
                takes about four minutes.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">2.</strong> We write the gate, the
                questions, the weights and the result bands from your answers.
              </li>
              <li>
                <strong className="text-[var(--foreground)]">3.</strong> You get a live link
                within 24 hours, and we walk you through what it screens out and why.
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

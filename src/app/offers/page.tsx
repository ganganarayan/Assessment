import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentTenant } from "@/lib/tenant/context";
import { Nav } from "@/components/marketing/Nav";
import { Footer } from "@/components/marketing/Footer";
import { OfferDetail } from "@/components/marketing/OfferDetail";
import { closedOffers, offerClosed, openOffers } from "@/lib/marketing/offers";
import { resolveOfferSlotsLeft } from "@/lib/settings/config";
import { platformPageMetadata } from "@/lib/seo/site";

/**
 * /offers - everything currently on offer, and the archive of what has closed.
 *
 * 🟡 THERE IS NO TRIAL LINK ON THIS PAGE, ON PURPOSE.
 *
 * The trial is self-serve and starts a 14-day clock the moment it is taken. The offers
 * here are supported builds against a 21-day plan with preconditions attached, so the
 * only sensible next step from this page is the intake form: it lets us see whether the
 * ad account and the offer are actually ready before any clock starts. A trial button
 * sitting next to that would let somebody burn the trial first and then apply, which is
 * the one order in which the offer cannot be delivered.
 *
 * That is why <Nav showCta={false}> - it suppresses both the trial button and the offer
 * bar above it, which point at the same funnel. The route back to the trial is the link
 * to the main page at the bottom, which is where the trial belongs.
 *
 * Platform-only, like every other marketing route: a tenant's branded domain serves
 * their funnel, and our promotions appearing inside their brand would be our offer in
 * somebody else's shop window.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  return platformPageMetadata({
    title: "Offers",
    description:
      "Current Assess360 offers. Founders offer: the first 20 onboarded get their whole funnel built with them inside the trial, free, on a 21-day plan from fit call to first closed client.",
    path: "/offers",
  });
}

export default async function OffersPage() {
  if (await getCurrentTenant()) notFound();

  // "Open" is not the same question as "still taking applications". An offer whose
  // closing date has passed is rendered with the archive, because the campaign that
  // pointed here has moved on and a live call to action nobody is watching is a promise
  // nobody is keeping. See offerClosed().
  const published = openOffers();
  const open = published.filter((o) => !offerClosed(o));
  const closed = [...published.filter((o) => offerClosed(o)), ...closedOffers()];
  // null, not 0, when the counter is unmaintained or spent: the component then shows no
  // count at all rather than standing there advertising a closed door.
  const slotsLeft = await resolveOfferSlotsLeft().catch(() => null);

  return (
    <>
      <Nav anchorBase="/" showCta={false} showSignin={false} />
      <main id="main">
        <section className="border-b">
          <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-4xl">
              Offers
            </h1>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              What is on the table right now. Offers are released from time to time, run
              until their slots are gone, and then stay on this page so the terms they ran
              on are still readable.
            </p>
          </div>
        </section>

        {open.length === 0 ? (
          <section className="border-b">
            <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-20">
              <h2 className="text-2xl font-bold tracking-tight">Nothing open at the moment</h2>
              <p className="mt-4 leading-relaxed text-[var(--muted-foreground)]">
                No offer is running today. The product is on the main page, at its ordinary
                price.
              </p>
            </div>
          </section>
        ) : (
          open.map((offer) => (
            <OfferDetail key={offer.slug} offer={offer} slotsLeft={slotsLeft} closed={false} />
          ))
        )}

        {closed.length > 0 ? (
          <>
            <section className="border-b bg-[var(--muted)]">
              <div className="mx-auto max-w-3xl px-5 py-10 sm:px-8">
                <h2 className="text-xl font-bold tracking-tight">Closed</h2>
                <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
                  Offers that have run. Kept here because the links are still out there.
                </p>
              </div>
            </section>
            {closed.map((offer) => (
              <OfferDetail key={offer.slug} offer={offer} slotsLeft={null} closed />
            ))}
          </>
        ) : null}

        {/* The way back. The main page is where the product is argued and where the
            trial is taken, and this is the only link on the page that leads to it. */}
        <section className="border-b">
          <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8">
            <h2 className="text-xl font-bold tracking-tight">
              New here, and want the product rather than the offer?
            </h2>
            <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
              The main page explains what the gate does to an ad account, what it scores,
              and what it costs.
            </p>
            <Link
              href="/"
              className="mt-5 inline-block font-medium underline underline-offset-4"
            >
              Go to the main page
            </Link>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}

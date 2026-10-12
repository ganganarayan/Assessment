import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { DFY, OFFER_SLOTS } from "@/lib/marketing/content";
import { resolveOfferSlotsLeft } from "@/lib/settings/config";

/**
 * The offer, as a section.
 *
 * The headline sells the OUTCOME, not the apparatus. "A funnel that already works" is
 * a thing nobody wants to own: the buyer wants the calls at the end of it, and saying
 * so costs nothing and removes the only sentence here that asked them to care about
 * plumbing.
 *
 * The offer had one home: the strip above the nav, which a reader skims past in the
 * first second and never meets again. This is the same offer as a section, placed after
 * the mechanism has been explained, where somebody who now believes the argument can act
 * on it.
 *
 * The slot count is READ, not written. The strip already resolves it per request, and a
 * hardcoded "20 slots" on a page where the bar says three is the kind of contradiction a
 * careful buyer notices and a careless one repeats back to you on the call. When the
 * count cannot be resolved the sentence simply drops the number rather than guessing.
 */
export async function BuiltWithYou() {
  const slots = await resolveOfferSlotsLeft().catch(() => null);

  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="rounded-2xl border bg-[var(--muted)] px-8 py-14 sm:px-12">
          <div className="max-w-3xl">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              You are not buying software. You are buying calls that are worth taking.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              Send a short brief, then take one 30-minute call. We set up your workspace, lay the
              scorecard in, tweak the gate with you, connect your Meta pixel and the Conversions
              API, and build the exclusion and retargeting audiences inside your own ad account. You
              are in the room while it happens, and it is live before you hang up.
            </p>
            <Link href={DFY.href} className={`mt-8 ${buttonVariants({ size: "lg" })}`}>
              {DFY.cta}
            </Link>
            <p className="mt-4 text-sm text-[var(--muted-foreground)]">
              {slots === null
                ? `First ${OFFER_SLOTS} clients. Check the banner at the top for slots left.`
                : `First ${OFFER_SLOTS} clients. ${slots} ${slots === 1 ? "slot" : "slots"} left.`}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

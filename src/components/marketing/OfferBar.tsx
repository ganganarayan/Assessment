import Link from "next/link";
import { OFFER, DFY } from "@/lib/marketing/content";
import { resolveOfferSlotsLeft } from "@/lib/settings/config";

/**
 * The offer bar, above the nav on every marketing surface.
 *
 * It lives inside Nav rather than being rendered by each page, so a new public page
 * cannot ship without it. The slot count is read here rather than passed in, which keeps
 * every call site a single tag.
 *
 * 🔴 It disappears at zero slots instead of reading "0 slots left". A bar announcing the
 * offer is closed, sitting above a button that asks you to take it, is worse than no bar
 * - and the state where somebody has filled the twenty and not yet changed the copy is
 * exactly the state this has to survive.
 *
 * An UNSET count means the full allowance rather than silence (see resolveOfferSlotsLeft):
 * before a single build is done, "20 slots left" is true, and requiring the operator to
 * seed a number first would mean the offer quietly fails to launch.
 */
export async function OfferBar() {
  const slots = await resolveOfferSlotsLeft().catch(() => null);
  if (slots === null) return null;

  return (
    <div className="border-b border-green-600/30 bg-green-600/10">
      <Link
        href={DFY.href}
        className="mx-auto flex max-w-6xl items-center justify-center gap-2 px-5 py-2 text-center text-sm font-medium text-green-800 hover:underline dark:text-green-400 sm:px-8"
      >
        {OFFER.bar(slots)}
      </Link>
    </div>
  );
}

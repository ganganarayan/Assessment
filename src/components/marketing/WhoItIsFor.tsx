import Link from "next/link";
import { AUDIENCES } from "@/lib/marketing/content";
import { TEMPLATE_CATEGORIES } from "@/features/templates/schema";
import { DFY } from "@/lib/marketing/content";

/**
 * The twenty audiences, under "why this exists".
 *
 * The list is READ FROM the template library's own category list rather than written
 * here. Two reasons, and the second is the important one: a new vertical appears on the
 * home page the moment its scorecard is added, and more to the point this section can
 * never advertise an audience the product has nothing for. verify:templates asserts
 * every category has a built-in behind it, so the sentence about a ready-made scorecard
 * is enforced rather than hoped for.
 *
 * Rendered as a plain grid of names. A card each, with an icon and a paragraph, would
 * be twenty times the visual weight for a section whose whole job is to let someone find
 * their own line and move on.
 */
export function WhoItIsFor() {
  return (
    <section id="who" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{AUDIENCES.heading}</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {AUDIENCES.lead}
        </p>

        <ul className="mt-8 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_CATEGORIES.map((c) => (
            <li
              key={c}
              className="rounded-lg border bg-[var(--background)] px-4 py-3 text-sm font-medium"
            >
              {c}
            </li>
          ))}
        </ul>

        <p className="mt-6 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">
          {AUDIENCES.note}
        </p>

        <p className="mt-6 text-[var(--muted-foreground)]">
          Not on the list?{" "}
          <Link href={DFY.href} className="font-medium underline underline-offset-4">
            Tell us what you sell
          </Link>{" "}
          and we will write the gate for it. The mechanism does not care about the
          industry, only about whether a bad lead costs you something.
        </p>
      </div>
    </section>
  );
}

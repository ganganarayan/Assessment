import Link from "next/link";
import { AUDIENCES } from "@/lib/marketing/content";
import { TEMPLATE_CATEGORIES } from "@/features/templates/schema";
import { getCta } from "@/lib/settings/cta";
import { CtaLink } from "./CtaLink";
import { FEATURED_INDUSTRIES, INDUSTRY_BY_CATEGORY } from "@/lib/marketing/industries";

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
export async function WhoItIsFor() {
  const cta = await getCta();

  return (
    <section id="who" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-4xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{AUDIENCES.heading}</h2>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-[var(--muted-foreground)]">
          {AUDIENCES.lead}
        </p>

        {/*
          The audiences we point ads and email at, above the list and visibly
          heavier than it.

          FEATURED rather than every industry page, and that distinction now
          earns its keep: there is a page for all twenty-one categories, and
          rendering twenty-one identical green cards here would be a wall that
          tells a visitor nothing about where to start. The featured few get the
          weight, and every other audience is one click away in the grid below,
          where its own name is the link.
        */}
        <ul className="mt-8 grid gap-3 sm:grid-cols-2">
          {FEATURED_INDUSTRIES.map((p) => (
            <li key={p.path}>
              <Link
                href={p.path}
                className="flex h-full flex-col rounded-lg border-2 border-green-600/40 bg-green-600/5 px-5 py-4 transition-colors hover:border-green-600"
              >
                <span className="font-bold text-green-700 dark:text-green-400">{p.shortName}</span>
                <span className="mt-1 text-sm text-[var(--muted-foreground)]">{p.cardLine}</span>
                <span className="mt-3 text-sm font-medium underline underline-offset-4">
                  Read the page for this industry
                </span>
              </Link>
            </li>
          ))}
        </ul>

        {/*
          The categories, each a link when a page exists for it.

          The list still comes from the template library rather than from the
          industry registry, so the section can never advertise an audience the
          product has no scorecard for. What the registry decides is only whether
          a name is clickable: a category with a page of its own gets the arrow
          and the hover, and one without stays a plain name. That way neither
          list has to be kept in step with the other by hand, and a new industry
          page lights up its own row the moment it ships.
        */}
        <ul className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATE_CATEGORIES.map((c) => {
            const industry = INDUSTRY_BY_CATEGORY.get(c);
            return (
              <li key={c}>
                {industry ? (
                  <Link
                    href={industry.path}
                    className="flex items-center justify-between gap-2 rounded-lg border bg-[var(--background)] px-4 py-3 text-sm font-medium transition-colors hover:border-green-600"
                  >
                    {c}
                    <span aria-hidden="true" className="text-[var(--muted-foreground)]">
                      &rarr;
                    </span>
                  </Link>
                ) : (
                  <span className="block rounded-lg border bg-[var(--background)] px-4 py-3 text-sm font-medium">
                    {c}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <p className="mt-6 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">
          {AUDIENCES.note}
        </p>

        <p className="mt-6 text-[var(--muted-foreground)]">
          Not on the list?{" "}
          <CtaLink href={cta.href} className="font-medium underline underline-offset-4">
            Tell us what you sell
          </CtaLink>{" "}
          and we will write the gate for it. The mechanism does not care about the
          industry, only about whether a bad lead costs you something.
        </p>
      </div>
    </section>
  );
}

import Link from "next/link";
import { MARKETING } from "@/lib/marketing/content";
import { PAGES } from "@/lib/seo/registry";
import type { PageKind } from "@/lib/seo/types";
import { seoPath } from "@/lib/seo/urls";

/**
 * The guides, grouped the way the content already classifies itself.
 *
 * `kind` is an existing field that drives breadcrumbs and schema, so grouping by it costs
 * no new metadata and cannot drift from the pages: a new guide lands in the right block by
 * virtue of what it is. Listing every kind, including ones with no pages yet, means a
 * future glossary page appears here on its own rather than silently vanishing from the
 * only navigation that reaches these pages at all.
 */
const GUIDE_GROUPS: ReadonlyArray<{ kind: PageKind; label: string }> = [
  { kind: "pillar", label: "Guides" },
  { kind: "use-case", label: "By industry" },
  { kind: "comparison", label: "Comparisons" },
  { kind: "glossary", label: "Glossary" },
];

/**
 * The footer no longer repeats the header. It used to open with the logo and the same
 * nav row the sticky header already shows on every screen, which is why this component
 * took an anchor-base prop at all: those were the only links here needing one. Removing
 * the row removed the prop with it, and everything left points at a real path.
 */
export function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        {/*
          Every guide, listed on every page.

          This is the only place in the site chrome where the guides and the knowledge base
          are reachable, and that matters twice over. A visitor has no other route to them
          short of typing a URL. A crawler, meanwhile, reads a page with no internal links
          from the site's own navigation as peripheral however good the content is - the
          sitemap says a page exists, the navigation says it matters.

          Generated from the content registry rather than hand-listed, so a new guide
          appears here the moment it ships and a removed one cannot linger as a dead link.

          The header carries the knowledge base too, but that row is desktop-only; on a
          phone this footer is the entry point, which is why it holds the full list.
        */}
        <div className="mt-12 border-t pt-10">
          <nav aria-label="Answers">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Answers
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted-foreground)]">
              Short, direct answers about lead qualification, scoring and assessments - one
              question per page.
            </p>
            <Link
              href="/answers"
              className="mt-3 inline-block text-sm font-medium underline underline-offset-4"
            >
              Browse all answers
            </Link>
          </nav>

          {/*
            Grouped, and a grid rather than a column. As one flat list of 30-odd items this
            was taller than the page carrying it: on a policy page you scrolled past the whole
            catalogue to reach the privacy and terms links below, and the names read as
            scattered because nothing said which were guides, which were industries and which
            were comparisons. Six columns on a wide screen puts each group in two or three
            rows; two columns on a phone, for the same reason.
          */}
          {GUIDE_GROUPS.map((group) => {
            const pages = PAGES.filter((p) => p.kind === group.kind);
            if (pages.length === 0) return null;
            return (
              <nav key={group.kind} aria-label={group.label} className="mt-10">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                  {group.label}
                </h2>
                <ul className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-6">
                  {pages.map((p) => (
                    <li key={p.slug}>
                      <Link
                        href={seoPath(p.slug)}
                        className="text-sm text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
                      >
                        {p.shortName}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            );
          })}
        </div>

        <div className="mt-10 flex flex-col gap-4 border-t pt-6 text-sm text-[var(--muted-foreground)] sm:flex-row sm:items-center sm:justify-between">
          <p>&copy; {year} {MARKETING.name}. All rights reserved.</p>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            <Link href="/privacy" className="transition-colors hover:text-[var(--foreground)]">
              Privacy
            </Link>
            <Link href="/terms" className="transition-colors hover:text-[var(--foreground)]">
              Terms
            </Link>
            <Link href="/refund" className="transition-colors hover:text-[var(--foreground)]">
              Refunds
            </Link>
            <Link href="/shipping" className="transition-colors hover:text-[var(--foreground)]">
              Shipping
            </Link>
            <Link href="/contact" className="transition-colors hover:text-[var(--foreground)]">
              Contact
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

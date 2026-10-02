import Link from "next/link";
import { MARKETING, NAV_LINKS } from "@/lib/marketing/content";
import { PAGES } from "@/lib/seo/registry";
import { seoPath } from "@/lib/seo/urls";

export function Footer({ anchorBase = "" }: { anchorBase?: string }) {
  const year = new Date().getFullYear();

  return (
    <footer>
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
          <a href={anchorBase ? `${anchorBase}#top` : "#top"} className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span
              aria-hidden="true"
              className="grid h-7 w-7 place-items-center rounded-md bg-green-600 text-white"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.4" opacity="0.35" />
                <path d="M12 3a9 9 0 0 1 8.49 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </span>
            {MARKETING.name}
          </a>

          <nav className="flex flex-wrap gap-x-8 gap-y-3" aria-label="Footer">
            {NAV_LINKS.map((l) => (
              <a
                key={l.href}
                href={`${anchorBase}${l.href}`}
                className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
              >
                {l.label}
              </a>
            ))}
            <Link
              href={MARKETING.signupHref}
              className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              Start 14-day trial
            </Link>
          </nav>
        </div>

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
        <div className="mt-12 grid gap-8 border-t pt-10 sm:grid-cols-2">
          <nav aria-label="Guides">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Guides
            </h2>
            <ul className="mt-4 flex flex-col gap-2.5">
              {PAGES.map((p) => (
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

          <nav aria-label="Answers">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
              Answers
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-[var(--muted-foreground)]">
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

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MARKETING, NAV_LINKS } from "@/lib/marketing/content";

/**
 * `anchorBase` exists because this nav is rendered on pages that are not the landing
 * page. NAV_LINKS are in-page anchors ("#pricing"); on /lead-qualification-software they
 * would scroll to nothing. SEO pages pass "/" so the same links become "/#pricing".
 */
export function Nav({ anchorBase = "" }: { anchorBase?: string }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--background)]">
      <nav
        className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8"
        aria-label="Primary"
      >
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

        <div className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={`${anchorBase}${l.href}`}
              className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
            >
              {l.label}
            </a>
          ))}
          {/* A real route, not an in-page anchor. The knowledge base and the guides had
              no entry point anywhere in the site chrome: they were reachable from the
              sitemap and from each other, and from nothing a visitor would ever click. */}
          <Link
            href="/answers"
            className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            Answers
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <ThemeToggle />
          {/* Returning customers had no way in from the marketing page: the only route to
              /sign-in was the footer's legal row or typing the URL. Ghost, not outline -
              a secondary action next to the trial CTA, which stays the only filled
              button on the page. */}
          <Link
            href={MARKETING.signinHref}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Sign in
          </Link>
          <Link href={MARKETING.signupHref} className={buttonVariants({ size: "sm" })}>
            Start 14-day trial
          </Link>
        </div>
      </nav>
    </header>
  );
}

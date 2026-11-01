import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { MARKETING, NAV_LINKS, SECTION_LINKS, navHref } from "@/lib/marketing/content";
import { getCta } from "@/lib/settings/cta";
import { resolvePlatformMetaConfig } from "@/lib/settings/config";
import { PlatformPixel } from "@/components/platform-pixel";
import { LandingTracker } from "@/features/billing/components/landing-tracker";
import { OfferBar } from "./OfferBar";
import { CtaLink } from "./CtaLink";
import { SectionStrip, type StripItem } from "./SectionStrip";
import { BackToTop } from "./BackToTop";
import { cn } from "@/lib/utils";

/**
 * `anchorBase` exists because this nav is rendered on pages that are not the landing
 * page. NAV_LINKS are in-page anchors ("#pricing"); on /lead-qualification-software they
 * would scroll to nothing. SEO pages pass "/" so the same links become "/#pricing".
 */
/**
 * `showCta` exists for /offers, which must not carry the trial link: the offer there is
 * a supported build with preconditions, and a self-serve trial taken first is the one
 * order in which it cannot be delivered. It suppresses the offer bar as well as the
 * button, because both point at the same funnel.
 *
 * `showSignin` exists for the same page. /offers is the TOP of a cold funnel: ads land
 * there, and the next step is the application or the main page. A sign-in button is for
 * somebody who already has an account, and on that page it is one more door out of a
 * screen that is supposed to have two.
 *
 * 🟢 PAGE-VIEW TRACKING LIVES HERE, not on each page. Every public surface renders this
 * nav, so mounting the pixel and the view recorder here is what makes "every visitor to
 * any page is counted" structurally true rather than a thing to remember. LandingTracker
 * records the PATH, so /platform/stats can break views down by page. Before this, only
 * the landing page was instrumented and /offers was invisible.
 *
 * 🔴 So do NOT also mount PlatformPixel or LandingTracker on a page that renders this
 * nav: two PageViews for one visit reads as double the traffic. /sign-up and /w mount
 * their own because neither has this nav.
 */
export async function Nav({
  anchorBase = "",
  showCta = true,
  showSignin = true,
}: {
  anchorBase?: string;
  showCta?: boolean;
  showSignin?: boolean;
}) {
  const [cta, { pixelId }] = await Promise.all([getCta(), resolvePlatformMetaConfig()]);

  // The strip's own links everywhere; the first row's links and Sign in only below the
  // breakpoint where the first row hides them.
  const stripItems: StripItem[] = [
    ...NAV_LINKS.map((l) => ({ label: l.label, href: navHref(l.href, anchorBase), className: "md:hidden" })),
    ...SECTION_LINKS.map((l) => ({ label: l.label, href: navHref(l.href, anchorBase) })),
    { label: "Answers", href: "/answers", className: "md:hidden" },
    { label: "Offers", href: "/offers", className: "md:hidden" },
    ...(showSignin ? [{ label: "Sign in", href: MARKETING.signinHref, className: "sm:hidden" }] : []),
  ];

  return (
    <header className="sticky top-0 z-40 border-b bg-[var(--background)]">
      <PlatformPixel pixelId={pixelId} />
      <LandingTracker />
      {/* Inside the sticky header, above the nav row, so it travels with it rather than
          scrolling away - and so a new public page cannot ship without the offer on it. */}
      {showCta ? <OfferBar /> : null}
      <nav
        className="mx-auto flex h-14 max-w-6xl items-center justify-between px-5 sm:px-8"
        aria-label="Primary"
      >
        <a href={anchorBase ? `${anchorBase}#top` : "#top"} className="flex shrink-0 items-center gap-2 text-base font-bold tracking-tight sm:text-lg">
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

        <div className="hidden items-center gap-6 md:flex lg:gap-8">
          {NAV_LINKS.map((l) => (
            <a
              key={l.href}
              href={navHref(l.href, anchorBase)}
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
          {/* Also a real route. It stays in the nav even with showCta false, i.e. on
              /offers itself: the bar that announces the current offer is the thing
              suppressed there, and a visitor who lands on a promotion deep-link still
              needs to see that offers are a standing part of the site. */}
          <Link
            href="/offers"
            className="text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
          >
            Offers
          </Link>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          {/* Hidden on a phone, where the first row only has room for the logo and the
              CTA; the theme still follows the device setting there. */}
          <span className="hidden sm:inline-flex">
            <ThemeToggle />
          </span>
          {/* Returning customers had no way in from the marketing page: the only route to
              /sign-in was the footer's legal row or typing the URL. Ghost, not outline -
              a secondary action next to the trial CTA, which stays the only filled
              button on the page. On a phone it moves into the strip below. */}
          {showSignin ? (
            <Link
              href={MARKETING.signinHref}
              className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "hidden sm:inline-flex")}
            >
              Sign in
            </Link>
          ) : null}
          {/* Wraps to two lines on a phone rather than running off the screen. */}
          {showCta ? (
            <CtaLink
              href={cta.href}
              className={cn(
                buttonVariants({ size: "sm" }),
                "h-auto min-h-8 max-w-[9.5rem] whitespace-normal py-1.5 text-center leading-tight sm:max-w-none sm:whitespace-nowrap",
              )}
            >
              {cta.trialLabel}
            </CtaLink>
          ) : null}
        </div>
      </nav>

      {/* Second row, so the section jumps get room instead of crowding the first. On a
          phone it also carries the first row's links, which are hidden there, and Sign
          in, which leaves the first row room for the CTA. */}
      <SectionStrip items={stripItems} />
      <BackToTop />
    </header>
  );
}

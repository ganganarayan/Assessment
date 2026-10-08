import {
  PLATFORM_SUPPORT_EMAIL,
  PLATFORM_SUPPORT_WHATSAPP_LINK,
} from "@/lib/platform-support";

/**
 * How to reach us, at the bottom of every signed-in page.
 *
 * The trial strip at the top says the same thing, and stops when the trial does. This
 * does not: a paying customer with a problem at 11pm should not have to remember an
 * address from a banner they last saw in week one. It costs one line and it is the
 * difference between a support email and a cancellation.
 *
 * Bottom LEFT, which is where a footer's own details belong and where nothing else on
 * these pages competes for the eye.
 */
export function AppFooter() {
  return (
    <footer className="mt-10 border-t px-4 py-4 text-xs text-[var(--muted-foreground)] md:px-8">
      <p>
        Support -{" "}
        <a href={`mailto:${PLATFORM_SUPPORT_EMAIL}`} className="underline hover:no-underline">
          {PLATFORM_SUPPORT_EMAIL}
        </a>
        , WA -{" "}
        <a
          href={PLATFORM_SUPPORT_WHATSAPP_LINK}
          target="_blank"
          rel="noreferrer"
          className="underline hover:no-underline"
        >
          +91 93568 19176
        </a>
      </p>
    </footer>
  );
}

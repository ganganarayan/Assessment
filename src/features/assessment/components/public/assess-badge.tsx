import { MARKETING } from "@/lib/marketing/content";
import Link from "next/link";

/**
 * The "Powered by Assess360" badge, shown on Gate and removed from Signal up.
 *
 * It is the only visible difference a $39 customer sees versus $79 on the respondent's
 * screen, so it has to be noticeable enough to be worth removing and quiet enough not to
 * cheapen their funnel. Bottom of the page, small, muted - not a floating overlay that
 * covers their content.
 *
 * Rendered server-side from the tenant's resolved plan. A client-side check would be
 * advisory: anyone could delete the node, and the one thing this must not be is
 * removable without paying.
 */
export function AssessBadge({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div className="mt-10 flex justify-center pb-6">
      <Link
        // Built from MARKETING.domain rather than typed out, so the badge on every Gate-tier
        // funnel follows the platform to a new domain instead of pointing at the old one
        // forever. The UTM is what makes this measurable as an acquisition channel.
        href={`${MARKETING.domain}/?utm_source=badge&utm_medium=referral`}
        target="_blank"
        rel="noopener"
        className="text-xs text-[var(--muted-foreground)] transition-opacity hover:opacity-80"
      >
        Powered by <span className="font-semibold">Assess360</span>
      </Link>
    </div>
  );
}

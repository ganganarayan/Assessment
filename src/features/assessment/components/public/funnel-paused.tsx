/**
 * The PAUSED page for a parked tenant's public funnel (FEATURE-GATES.md §2b).
 *
 * Three decisions worth keeping:
 *
 * 1. **200, not 404.** A parked tenant's funnel is almost always a live ad
 *    destination. A 404 reads as an outage, makes the ad platform mark the URL
 *    broken, and can get a campaign disapproved — punishing a lapsed customer by
 *    damaging their ad account is not what parking is for.
 * 2. **Nothing about billing.** The reader is a respondent who clicked an ad, not the
 *    tenant. "This workspace's trial expired" tells a stranger something private and
 *    makes the tenant look insolvent in front of their own audience.
 * 3. **noindex.** The page is temporary by definition; letting a search engine cache
 *    "not accepting responses" as the canonical description of the funnel outlives the
 *    pause.
 *
 * Unbranded on purpose: the Assess360 badge is a Gate entitlement, and `PARKED_LIMITS`
 * turns every feature off — including `brandingRemoved`. Rendering the badge here would
 * stamp our name on someone's dead ad link.
 */
export function FunnelPaused({ title }: { title: string | null }) {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <h1 className="text-xl font-semibold tracking-tight">
        {title ? title : "This assessment"} isn&apos;t accepting responses right now
      </h1>
      <p className="text-sm text-[var(--muted-foreground)]">
        It&apos;s paused temporarily. Nothing you may have submitted before has been lost. Please check
        back shortly, or get in touch with whoever shared this link with you.
      </p>
    </main>
  );
}

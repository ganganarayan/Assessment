import Link from "next/link";

/**
 * The product wordmark, top-left on every signed-in surface: /admin, /w, /platform and
 * /dashboard. One component so the four shells cannot drift apart — before this, only
 * the admin sidebar carried it and a workspace showed the tenant's name alone, which
 * left no indication of what the tenant's workspace was part of.
 *
 * `subtitle` is the scope UNDER the wordmark: the tenant whose workspace you are in, or
 * the one a super admin has entered. Hierarchy, not decoration — the brand is the
 * product, the line below it is where you currently are.
 *
 * 🔴 Signed-in surfaces only. This must never be rendered on a respondent-facing funnel
 * page (/a/..., /r/...): those are the tenant's own brand, and `brandingRemoved` is a
 * paid entitlement — stamping the product name there would both break that and put our
 * name on someone else's funnel.
 */
export function AppBrand({
  href,
  subtitle,
}: {
  /** Where the wordmark links — each shell's own home. */
  href: string;
  subtitle?: string | null;
}) {
  return (
    <div className="min-w-0">
      <Link href={href} className="block truncate text-lg font-semibold">
        Assess360
      </Link>
      {subtitle ? (
        <p className="truncate text-xs text-[var(--muted-foreground)]" title={subtitle}>
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}

import Link from "next/link";
import { getCurrentTenant } from "@/lib/tenant/context";
import { buttonVariants } from "@/components/ui/button";
import { NAV_LINKS } from "@/lib/marketing/content";

/**
 * 404. There was no not-found.tsx at all, so every dead URL - a mistyped funnel slug, a
 * stale link in someone's email, a crawler following an old path - got Next's unstyled
 * default page with no way back into the site.
 *
 * The recovery links are gated on the host, not shown unconditionally. On a tenant's own
 * domain this page is part of THEIR funnel, and offering "Pricing" and "How it works"
 * links to Assess360 there would advertise us on a customer's domain - which is the one
 * thing the plan that removes our badge is bought to prevent.
 */
export default async function NotFound() {
  const tenant = await getCurrentTenant();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center gap-6 px-6 py-16">
      <div className="flex flex-col gap-3">
        <span className="text-xs font-semibold uppercase tracking-widest text-[var(--muted-foreground)]">
          404
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          We couldn&rsquo;t find that page
        </h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          The link may be out of date, or the address may have a typo in it.
        </p>
      </div>

      <div>
        <Link href="/" className={buttonVariants()}>
          {tenant ? "Back to start" : "Go to the homepage"}
        </Link>
      </div>

      {tenant ? null : (
        <nav aria-label="Pages you might be looking for" className="flex flex-col gap-2 border-t pt-6">
          <p className="text-xs font-medium text-[var(--muted-foreground)]">
            Or try one of these:
          </p>
          <ul className="flex flex-wrap gap-x-4 gap-y-2 text-sm">
            {NAV_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={`/${l.href}`} className="underline underline-offset-4">
                  {l.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/contact" className="underline underline-offset-4">
                Contact
              </Link>
            </li>
          </ul>
        </nav>
      )}
    </main>
  );
}

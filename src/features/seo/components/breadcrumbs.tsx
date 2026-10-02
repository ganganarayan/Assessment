import Link from "next/link";

export type Crumb = { name: string; href: string };

/**
 * Visible breadcrumbs, matching the BreadcrumbList emitted in the page's JSON-LD.
 *
 * Both halves matter and for different readers: the markup is a crawl path and a SERP
 * display, while the visible trail is how a person who landed from a search result works
 * out where they are. The last crumb is the current page and is not a link.
 */
export function Breadcrumbs({ trail }: { trail: ReadonlyArray<Crumb> }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
        {trail.map((c, i) => {
          const last = i === trail.length - 1;
          return (
            <li key={c.href} className="flex items-center gap-2">
              {last ? (
                <span aria-current="page" className="text-[var(--foreground)]">{c.name}</span>
              ) : (
                <Link href={c.href} className="hover:text-[var(--foreground)] hover:underline">
                  {c.name}
                </Link>
              )}
              {last ? null : <span aria-hidden="true">/</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

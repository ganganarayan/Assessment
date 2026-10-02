import type { Section } from "@/lib/seo/types";

/**
 * Jump links, rendered as plain anchors.
 *
 * This is the concession to the fact that a thorough page is a long page: a reader lands
 * from a search result wanting one of these sections, and making them scroll past the
 * other four to find it is how a good page gets bounced. No JavaScript - the whole list
 * works from the HTML, which is also what makes it useful to a crawler mapping the page.
 */
export function OnThisPage({ sections, extra }: { sections: ReadonlyArray<Section>; extra?: ReadonlyArray<{ id: string; label: string }> }) {
  const items = [
    ...sections.map((s) => ({ id: s.id, label: s.heading })),
    ...(extra ?? []),
  ];
  if (items.length < 2) return null;

  return (
    <nav aria-label="On this page" className="my-8 rounded-xl border bg-[var(--muted)] p-4 sm:p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        On this page
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-sm">
        {items.map((i) => (
          <li key={i.id}>
            <a href={`#${i.id}`} className="hover:underline">
              {i.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

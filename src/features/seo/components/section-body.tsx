import type { Section } from "@/lib/seo/types";

/**
 * One section, rendered answer-first.
 *
 * The heading is a question, the next thing after it is the answer in a sentence or two,
 * and only then the detail. That order is the entire point: nobody reads a long page, so
 * a skimmer who reads nothing but the headings and the bold line still leaves with the
 * substance, while a crawler gets the depth underneath.
 */
export function SectionBody({ section, level = 2 }: { section: Section; level?: 2 | 3 }) {
  const Heading = level === 2 ? "h2" : "h3";
  return (
    <section id={section.id} className="scroll-mt-20">
      <Heading
        className={
          level === 2
            ? "text-xl font-bold tracking-tight sm:text-2xl"
            : "text-lg font-semibold tracking-tight"
        }
      >
        {section.heading}
      </Heading>

      <p className="mt-3 text-base font-medium leading-relaxed text-[var(--foreground)]">
        {section.answer}
      </p>

      {section.paragraphs.map((p) => (
        <p key={p.slice(0, 48)} className="mt-4 leading-relaxed text-[var(--muted-foreground)]">
          {p}
        </p>
      ))}

      {section.bullets.length > 0 ? (
        <ul className="mt-4 flex flex-col gap-2">
          {section.bullets.map((b) => (
            <li key={b.slice(0, 48)} className="flex gap-3 leading-relaxed text-[var(--muted-foreground)]">
              <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />
              <span>{b}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

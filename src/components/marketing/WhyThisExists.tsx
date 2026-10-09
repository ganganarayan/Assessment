import { WHY_EXISTS } from "@/lib/marketing/content";

/**
 * Why this exists, directly under the hero.
 *
 * No name, no photo, no "meet the founder". The credential being offered is the fact
 * itself - that the person who built this paid for the alternatives and ran traffic
 * through them - and a face would invite the reader to assess the person instead of the
 * argument. It is also the only thing on the page a competitor cannot copy by shipping
 * a feature, which is why it sits this high rather than near the footer.
 *
 * One fact per line, and the load-bearing words bolded, so the section still lands on
 * someone who is scanning rather than reading. At this position on the page, that is
 * most people.
 */
export function WhyThisExists() {
  return (
    <section id="why" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-3xl px-5 py-16 sm:px-8 sm:py-20">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{WHY_EXISTS.heading}</h2>
        <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
          {WHY_EXISTS.lead}
        </p>

        <ul className="mt-8 flex flex-col gap-4">
          {WHY_EXISTS.points.map((p) => (
            <li key={p.text} className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className="mt-1.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-green-600/10 text-green-600"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l4 4L19 6"
                    stroke="currentColor"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <p className="leading-relaxed text-[var(--muted-foreground)]">
                <Emphasised text={p.text} strong={p.strong} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/**
 * Bold the named phrases inside a line.
 *
 * Done by splitting on the phrases rather than by storing HTML, so the copy in
 * content.ts stays plain text that anyone can edit without being able to write markup -
 * and nothing from that file is ever injected as HTML. A phrase that no longer appears
 * in its line simply does not match, which degrades to an unbolded line instead of
 * throwing.
 */
function Emphasised({ text, strong }: { text: string; strong: readonly string[] }) {
  const parts = strong.reduce<string[]>(
    (acc, phrase) =>
      acc.flatMap((chunk) =>
        strong.includes(chunk) ? [chunk] : chunk.split(phrase).flatMap((p, i) => (i === 0 ? [p] : [phrase, p])),
      ),
    [text],
  );

  return (
    <>
      {parts.map((part, i) =>
        strong.includes(part) ? (
          <strong key={`${part}-${i}`} className="font-semibold text-[var(--foreground)]">
            {part}
          </strong>
        ) : (
          <span key={`${part}-${i}`}>{part}</span>
        ),
      )}
    </>
  );
}

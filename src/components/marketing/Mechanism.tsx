import { PILLARS } from "@/lib/marketing/content";

/**
 * "Gate, Score, Signal" - the mechanism, on its own, high on the page.
 *
 * It used to open the capability section two thirds of the way down, which meant the
 * one paragraph that explains what this product actually DOES was gated behind a
 * scroll. The three steps are the argument; the nineteen cards are the evidence for it,
 * and evidence belongs after the claim rather than in place of it.
 *
 * The anchor #capabilities stays on the feature grid, where the nav has always pointed.
 */
export function Mechanism() {
  return (
    <section id="mechanism" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Gate, Score, Signal</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            Three steps, in order. The first two keep your calendar clean. The third is the one no
            other assessment tool does, and it is the one that lowers what you pay per qualified
            lead.
          </p>
        </div>

        <MechanismDiagram />
      </div>
    </section>
  );
}

/**
 * The three-step diagram. Deliberately text and boxes rather than an image: it has to be
 * readable by a crawler and by an answer engine, it has to survive dark mode, and it has
 * to stack on a phone - which is three things a PNG of a flowchart does badly.
 */
function MechanismDiagram() {
  return (
    <ol className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="How Assess360 works, in three steps">
      {PILLARS.map((p, i) => (
        <li
          key={p.key}
          className="relative rounded-xl border bg-[var(--background)] p-5 text-center"
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {p.step}
          </p>
          <p className="mt-1 text-lg font-bold">{p.name}</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">{p.tagline}</p>
          {/* The connector is decorative and hidden from assistive tech: the ordered list
              already says these are sequential, and a screen reader announcing a chevron
              three times adds nothing. */}
          {i < PILLARS.length - 1 ? (
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-[var(--muted-foreground)] sm:block"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path
                  d="M9 6l6 6-6 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

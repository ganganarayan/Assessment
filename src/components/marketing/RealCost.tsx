import { REAL_COST } from "@/lib/marketing/content";
import { Emphasised } from "./Emphasised";

/**
 * The bill as arithmetic, straight after the itemised one.
 *
 * DisqualifiedCost above says what the charges ARE, line by line; this says what they
 * come to in a month, which is the one thing a list cannot do. It no longer sits directly
 * under the hero and no longer calls itself "the second cost": counting to two under a
 * list of eighteen charges undersells the problem, and the point of both sections is that
 * the charges repeat rather than arriving once.
 *
 * No call to action, like the section above it: these two exist to make the next five
 * worth reading, and asking for something here would spend the attention they just earned.
 */

/**
 * The rows alternate between two tones, which is the one thing this section does that
 * the one above it does not.
 *
 * 🟡 WHY ALTERNATING, AND WHY RED IS ALLOWED HERE. DisqualifiedCost is deliberately all
 * amber and says so in its own comment: it lists charges that need attention, and red is
 * kept for genuine danger. This section is the escalation, where the charges are totalled
 * into hours and money that have actually left, so the second tone being red is the
 * argument rather than decoration. Two tones, not four: a list in four colours reads as a
 * chart legend and the reader starts looking for the key instead of reading the lines.
 *
 * 🔴 THE CLASS STRINGS ARE LITERAL AND MUST STAY LITERAL. Tailwind compiles the classes
 * it can see in the source, so a tone built by interpolation (`bg-${colour}-500/15`)
 * compiles to nothing and the rows render untinted in production while looking right in
 * any environment that still has the full stylesheet.
 *
 * Only the number, the hairline and the heavy phrases carry the colour. Tinting whole
 * sentences fails contrast in one theme or the other and makes a wall of coloured text
 * nobody reads, which would lose the attention the colour was there to catch.
 */
const TONES = [
  {
    row: "border-amber-600/40 bg-amber-500/[0.07]",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    strong: "text-amber-800 dark:text-amber-300",
  },
  {
    row: "border-red-600/40 bg-red-500/[0.06]",
    badge: "bg-red-500/15 text-red-700 dark:text-red-400",
    strong: "text-red-800 dark:text-red-300",
  },
] as const;

function Charge({
  n,
  item,
}: {
  n: number;
  item: { readonly text: string; readonly strong: readonly string[] };
}) {
  const tone = TONES[(n - 1) % TONES.length]!;
  return (
    <li className={`flex items-start gap-3 rounded-lg border-l-2 py-2 pl-3 pr-3 ${tone.row}`}>
      <span
        aria-hidden="true"
        className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg text-sm font-bold ${tone.badge}`}
      >
        {n}
      </span>
      <p className="leading-relaxed text-[var(--muted-foreground)]">
        <Emphasised text={item.text} strong={item.strong} strongClassName={tone.strong} />
      </p>
    </li>
  );
}

export function RealCost() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{REAL_COST.heading}</h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
            {REAL_COST.lead}
          </p>
        </div>

        {/* Numbered, not ticked and not bulleted: the count is part of the claim, and a
            tick anywhere on this page means "this is fine". */}
        <ol className="mt-8 grid max-w-4xl gap-2.5">
          {REAL_COST.recurring.map((item, i) => (
            <Charge key={item.text} n={i + 1} item={item} />
          ))}
        </ol>

        <h3 className="mt-14 max-w-3xl text-lg font-semibold leading-snug sm:text-xl">
          {REAL_COST.mathHeading}
        </h3>
        {/* Restarting at 1 rather than continuing to 9. These are not more charges, they
            are the same charges multiplied by a month, and continuing the count would
            read as the bill simply being longer. */}
        <ol className="mt-5 grid max-w-4xl gap-2.5">
          {REAL_COST.math.map((item, i) => (
            <Charge key={item.text} n={i + 1} item={item} />
          ))}
        </ol>

        <p className="mt-12 max-w-3xl border-l-2 border-red-600 pl-5 text-lg font-semibold leading-relaxed sm:text-xl">
          {REAL_COST.closing}
        </p>
      </div>
    </section>
  );
}

import { WHY_EXISTS } from "@/lib/marketing/content";
import { Emphasised, Tick } from "./Emphasised";

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
              <Tick />
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

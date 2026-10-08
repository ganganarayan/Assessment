import { WHY_EXISTS } from "@/lib/marketing/content";

/**
 * Why this exists.
 *
 * No name, no photo, no "meet the founder". The credential being offered is the fact
 * itself - that the person who built this paid for the alternatives and ran traffic
 * through them - and a face would invite the reader to assess the person instead of the
 * argument. It is also the only thing on the page a competitor cannot copy by shipping a
 * feature.
 */
export function WhyThisExists() {
  return (
    <section id="why" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-3xl px-5 py-20 sm:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{WHY_EXISTS.heading}</h2>
        <p className="mt-6 text-lg leading-relaxed text-[var(--muted-foreground)]">
          {WHY_EXISTS.body}
        </p>
        <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
          {WHY_EXISTS.body2}
        </p>
      </div>
    </section>
  );
}

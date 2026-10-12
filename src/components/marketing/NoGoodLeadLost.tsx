import { NO_GOOD_LEAD, CAPABILITIES } from "@/lib/marketing/content";

/**
 * The fear section: the four routing capabilities, promoted out of the feature grid.
 *
 * Why they get a section. The objection that decides this sale is not price and not
 * setup time, it is "I am scared to turn away someone I could have closed". Loss
 * aversion beats efficiency every time, and it is the reason people buy a quiz tool and
 * then never configure the hard questions. These four are the answer to it, and as
 * cards eleven to fourteen of nineteen they were answering nobody.
 *
 * The copy is read from CAPABILITIES by title rather than restated here, so the feature
 * list and this section cannot drift apart. A title that no longer matches drops out
 * silently rather than rendering an empty card, which is the right failure: a missing
 * card is a copy edit, a broken one is a bug on the page that sells the thing.
 */
export function NoGoodLeadLost() {
  const cards = NO_GOOD_LEAD.titles
    .map((t) => CAPABILITIES.find((c) => c.title === t))
    .filter((c): c is (typeof CAPABILITIES)[number] => c !== undefined);

  return (
    <section id="no-good-lead-lost" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-3xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{NO_GOOD_LEAD.heading}</h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
            {NO_GOOD_LEAD.intro}
          </p>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          {cards.map((c) => (
            <div key={c.title} className="rounded-xl border bg-[var(--background)] p-7">
              <div
                aria-hidden="true"
                className="mb-4 grid h-10 w-10 place-items-center rounded-lg bg-green-600/10 text-green-600"
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M5 12l4 4L19 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-semibold">{c.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{c.body}</p>
            </div>
          ))}
        </div>

        <p className="mt-10 max-w-3xl text-lg font-medium leading-relaxed">{NO_GOOD_LEAD.closing}</p>
      </div>
    </section>
  );
}

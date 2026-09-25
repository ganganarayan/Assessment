export function Problem() {
  return (
    <section className="border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="grid items-stretch gap-6 md:grid-cols-2">
          <div className="rounded-2xl border bg-[var(--background)] p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              A bigger list isn&apos;t a better pipeline.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              Most quiz tools were built to grow a list, not qualify a pipeline — more emails,
              no idea who&apos;s ready to buy. Reps still open every conversation cold, guessing
              at budget, authority, and timing.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-[var(--muted-foreground)]">
              Assess360 answers those questions before the call is ever booked.
            </p>
          </div>

          <div className="rounded-2xl border-2 border-[#16a34a] bg-[var(--background)] p-6 sm:p-8">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              What Google Forms, JotForm, Typeform, AppSheet &amp; even ScoreApp can&apos;t do —
              <span className="text-[#16a34a]"> done here.</span>
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-[var(--muted-foreground)]">
              Gate the wrong-fit out at the door, score every answer, and feed Meta a
              qualified-only signal — one hosted link, no stack to stitch together.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

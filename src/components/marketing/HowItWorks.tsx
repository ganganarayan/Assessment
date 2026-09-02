import { STEPS } from "@/lib/marketing/content";

export function HowItWorks() {
  return (
    <section id="how" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">How it works</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            Three steps from a link to a scored, routed lead.
          </p>
        </div>

        <ol className="mt-12 grid gap-8 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-xl border p-7">
              <span className="text-sm font-bold text-green-600">{s.n}</span>
              <h3 className="mt-3 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

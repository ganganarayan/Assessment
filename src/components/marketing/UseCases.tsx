import { USE_CASES } from "@/lib/marketing/content";

export function UseCases() {
  return (
    <section className="border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Who runs on Assess360</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            Teams whose next call is only worth making if the lead fits.
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {USE_CASES.map((c) => (
            <div key={c.tag} className="flex flex-col rounded-xl border p-7">
              <h3 className="text-lg font-semibold">{c.tag}</h3>
              <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{c.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

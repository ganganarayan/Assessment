import { FAQS } from "@/lib/marketing/content";

export function Faq() {
  return (
    <section id="faq" className="scroll-mt-20 border-b">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions, answered</h2>

        <div className="mt-10 max-w-3xl divide-y border-y">
          {FAQS.map((f) => (
            <details key={f.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-lg font-semibold">
                {f.q}
                <svg
                  className="h-5 w-5 flex-none text-[var(--muted-foreground)] transition-transform group-open:rotate-45"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </summary>
              <p className="mt-3 max-w-2xl leading-relaxed text-[var(--muted-foreground)]">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

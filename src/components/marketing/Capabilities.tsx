import { CAPABILITIES } from "@/lib/marketing/content";

export function Capabilities() {
  return (
    <section id="capabilities" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
            Built to qualify, end to end
          </h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            The scoring, logic, and routing that turn a questionnaire into a qualification system.
          </p>
        </div>

        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {CAPABILITIES.map((it) => (
            <div key={it.title} className="rounded-xl border bg-[var(--background)] p-7">
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
              <h3 className="text-lg font-semibold">{it.title}</h3>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

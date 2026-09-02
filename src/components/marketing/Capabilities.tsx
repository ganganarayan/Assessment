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
                className={`mb-4 grid h-10 w-10 place-items-center rounded-lg ${
                  it.soon
                    ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                    : "bg-green-600/10 text-green-600"
                }`}
              >
                {it.soon ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" />
                    <path d="M12 8v4.5l3 1.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
              </div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold">{it.title}</h3>
                {it.soon ? (
                  <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Coming soon
                  </span>
                ) : null}
              </div>
              <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{it.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

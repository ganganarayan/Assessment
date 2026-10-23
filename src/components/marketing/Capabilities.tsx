import {
  FOLLOW_UP,
  PILLARS,
  followUpCapabilities,
  pillarCapabilities,
  supportingCapabilities,
  type Capability,
} from "@/lib/marketing/content";
import { VideoEmbed } from "./VideoEmbed";

/**
 * Capabilities, grouped under the three steps of the mechanism.
 *
 * It was nineteen flat cards in one grid. Every one of them is still here and the copy is
 * untouched - only the information architecture changed - because a flat grid makes a
 * reader rank nineteen things themselves, and the three that matter most (the Signal row)
 * sat in the middle of it looking like peers of "Team roles & access".
 *
 * Grouping is by title list in PILLARS, so nothing had to be edited card-by-card, and
 * anything a pillar does not claim renders in the supporting row rather than disappearing.
 *
 * `videos` maps a capability title to a validated embed URL. A tile with one shows
 * heading, video, body; a tile without one is byte-for-byte what it was before, so a
 * half-filled set never looks half-built.
 */
export function Capabilities({ videos }: { videos?: Record<string, string> }) {
  const supporting = supportingCapabilities();

  return (
    <section id="capabilities" className="scroll-mt-20 border-b bg-[var(--muted)]">
      <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
        <div className="max-w-2xl">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Everything it does</h2>
          <p className="mt-4 text-lg text-[var(--muted-foreground)]">
            The full set, grouped under the three steps. The argument is above; this is the
            evidence for it.
          </p>
        </div>

        <div className="mt-14 flex flex-col gap-14">
          {PILLARS.map((p) => (
            <div key={p.key}>
              <div className="max-w-3xl border-l-2 border-green-600 pl-5">
                <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
                  Step {p.step}
                </p>
                <h3 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                  {p.name} <span className="text-[var(--muted-foreground)]">- {p.tagline}</span>
                </h3>
                <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">{p.body}</p>
              </div>

              <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {pillarCapabilities(p).map((it) => (
                  <Tile key={it.title} it={it} video={videos?.[it.title]} />
                ))}
              </div>
            </div>
          ))}

          {/* The follow-up group, in the same grammar as a pillar and deliberately not
              numbered - FOLLOW_UP in content.ts says why it is not a fourth step. It
              renders as the last child of this same column so it inherits the gap
              rather than inventing its own spacing. */}
          <div>
            <div className="max-w-3xl border-l-2 border-green-600 pl-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-green-600">
                {FOLLOW_UP.eyebrow}
              </p>
              <h3 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">
                {FOLLOW_UP.name}{" "}
                <span className="text-[var(--muted-foreground)]">- {FOLLOW_UP.tagline}</span>
              </h3>
              <p className="mt-3 leading-relaxed text-[var(--muted-foreground)]">
                {FOLLOW_UP.body}
              </p>
            </div>

            <div className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {followUpCapabilities().map((it) => (
                <Tile key={it.title} it={it} video={videos?.[it.title]} />
              ))}
            </div>
          </div>
        </div>

        {supporting.length > 0 ? (
          <div className="mt-16 border-t pt-10">
            <h3 className="text-lg font-semibold">Everything else it does</h3>
            <p className="mt-2 max-w-2xl text-sm text-[var(--muted-foreground)]">
              Useful, and not the reason anyone switches.
            </p>
            <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {supporting.map((it) => (
                <div key={it.title} className="rounded-xl border bg-[var(--background)] p-5">
                  <h4 className="font-semibold">{it.title}</h4>
                  <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
                    {it.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** One capability card. Unchanged markup - it moved, it was not rewritten. */
function Tile({ it, video }: { it: Capability; video?: string }) {
  return (
    <div className="rounded-xl border bg-[var(--background)] p-7">
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
            <path
              d="M12 8v4.5l3 1.8"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path
              d="M5 12l4 4L19 6"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        )}
      </div>
      <div className="flex items-center gap-2">
        <h4 className="text-lg font-semibold">{it.title}</h4>
        {it.soon ? (
          <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            Coming soon
          </span>
        ) : null}
      </div>
      {video ? (
        <div className="mt-4">
          <VideoEmbed src={video} title={it.title} />
        </div>
      ) : null}
      <p className="mt-2 leading-relaxed text-[var(--muted-foreground)]">{it.body}</p>
    </div>
  );
}

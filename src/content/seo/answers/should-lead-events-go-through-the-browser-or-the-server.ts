import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "should-lead-events-go-through-the-browser-or-the-server",
  question: "Should lead events go through the browser pixel or the server?",
  short:
    "Both, deduplicated on a shared event id: the browser pixel catches what it can, and the server send is what makes the count complete and countable.",
  topicId: "meta-ads",
  primaryKeyword: "browser pixel vs conversions api",
  secondaryKeywords: [
    "server side conversion tracking",
    "conversions api lead events",
    "event deduplication meta",
  ],
  related: ["what-is-a-qualified-only-conversion-event", "can-i-retarget-only-the-leads-that-qualified"],
  updatedAt: "2026-10-06",
  body: [
    {
      id: "why-both",
      heading: "Why both, rather than one or the other",
      answer:
        "A browser event can be blocked before it fires; a server event cannot, but it lacks the browser context that improves matching.",
      paragraphs: [
        "A meaningful share of traffic never fires a browser pixel at all, because of blockers, privacy settings or a browser that closes the tab first. Everything that does not fire is a conversion that happened and was not counted, and campaigns optimise on what is counted.",
        "The server send has the opposite profile: it always runs, because it is your own code reacting to your own database, but it has to be given the identifiers the browser would have supplied. Sending both and letting them deduplicate takes the strengths of each.",
      ],
      bullets: [],
    },
    {
      id: "dedup",
      heading: "Deduplication is a shared event id, not a guess",
      answer:
        "The same conversion must carry the same event id in both sends, or the platform counts it twice.",
      paragraphs: [
        "This is the part implementations get wrong, and the symptom is an event count that looks too good. The id has to be generated once for the conversion and used by both the browser call and the server call.",
        "Assess360 generates it with the submission, so the two sends about one completion carry one id by construction rather than by a developer remembering to pass it through.",
      ],
      bullets: [],
    },
    {
      id: "qualification",
      heading: "Qualification is server-side knowledge anyway",
      answer:
        "The score is computed on the server, so the moment you know someone qualified is already a server moment.",
      paragraphs: [
        "That makes the server the natural place to report it. Waiting for the browser to confirm something the server already knows adds a dependency on a page staying open, which on a mobile ad click is not a safe assumption.",
      ],
      bullets: [],
    },
  ],
};

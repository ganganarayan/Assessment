import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "will-a-qualification-gate-reject-good-leads",
  question: "Will a qualification gate reject good leads?",
  short:
    "A gate built only from yes-or-no questions will eventually reject someone good, because one weak answer is enough to fail a lead who is strong everywhere else.",
  topicId: "pre-call-qualification",
  primaryKeyword: "will a qualification gate reject good leads",
  secondaryKeywords: [
    "losing good leads to screening",
    "lead scoring bands",
    "borderline lead review",
  ],
  related: [
    "what-is-a-good-lead-score-threshold",
    "should-i-let-unqualified-leads-book-a-call",
    "what-do-i-do-with-a-lead-who-cannot-start-yet",
  ],
  updatedAt: "2026-10-12",
  body: [
    {
      id: "why-hard-gates-leak",
      heading: "Why a hard gate leaks the people you want",
      answer:
        "Because each question gets a veto. Ask six and you have given six vetoes to a model that is only approximately right about any of them.",
      paragraphs: [
        "Headcount is the usual culprit. A rule that fails anyone under ten staff reads as sensible until a seven-person business turning over twelve crore hits it, and that business was the buyer. The question was a reasonable proxy and the proxy was wrong for exactly the person worth the most.",
        "This is also why so many screening questions are written soft. The person configuring them can feel the veto, so they set the bar where nobody fails, and then the gate screens nothing at all. The fear of losing someone good is what makes most gates decorative.",
      ],
      bullets: [],
    },
    {
      id: "score-and-band",
      heading: "Score the answers, then band the total",
      answer:
        "Give each answer points, add them up, and set two thresholds instead of one: clear, worth a look, and out.",
      paragraphs: [
        "A weak answer on one axis is then survivable, because strength elsewhere can carry it. The band in the middle is the part that does the real work: those people go through the funnel exactly as everyone else does, and arrive on your list flagged for you to read before a call. Nobody is rejected by arithmetic alone.",
        "Keep a small number of absolute disqualifiers for the facts that genuinely end it, such as somebody who cannot authorise the spend or who wants something you do not sell. Everything else should be worth points rather than hold a veto.",
      ],
      bullets: [
        "Absolute: the handful of answers that end the conversation whatever else is true.",
        "Scored: everything else, weighted by how much it actually predicts a purchase.",
        "Banded: through, through-and-flagged, or out, decided on the total.",
      ],
    },
  ],
};

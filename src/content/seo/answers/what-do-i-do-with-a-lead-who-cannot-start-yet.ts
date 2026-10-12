import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-do-i-do-with-a-lead-who-cannot-start-yet",
  question: "What do I do with a lead who fits but cannot start yet?",
  short:
    "Treat timing as its own outcome rather than a rejection: let them finish the assessment, keep the result, and close on the next cycle instead of the current one.",
  topicId: "pre-call-qualification",
  primaryKeyword: "lead who is not ready to buy yet",
  secondaryKeywords: ["waitlist leads", "bad timing lead", "nurture leads who fit"],
  related: [
    "will-a-qualification-gate-reject-good-leads",
    "should-i-let-unqualified-leads-book-a-call",
    "how-do-i-qualify-leads-before-a-sales-call",
  ],
  updatedAt: "2026-10-12",
  body: [
    {
      id: "timing-is-not-fit",
      heading: "Timing is not a fit problem",
      answer:
        "Someone who clears every bar and cannot make your dates has failed a calendar, not a filter. They are frequently the best lead in the file.",
      paragraphs: [
        "The mistake is handing them the same exit as the person who was never going to buy. One is a rejection and the other is a diary clash, and filing them together loses a buyer and tells you nothing about why.",
        "It matters most when a cohort or a date is involved. On a short run-up, a large share of genuinely qualified people will fail on availability alone. If that group outnumbers the people who can start, the problem is lead time rather than anything in the funnel.",
      ],
      bullets: [],
    },
    {
      id: "what-to-do-instead",
      heading: "Let them finish, then hold the place",
      answer:
        "Send them through the whole assessment, give them the result, and close on the next cycle instead of the current one.",
      paragraphs: [
        "Throwing away a completed diagnosis to save a form submission is the wrong trade. They have done the work, you have the answers, and when the next cycle opens you are writing to somebody you already understand rather than to a name on a list.",
        "Change only the close. Same diagnosis, same explanation, a call to action that offers the next intake rather than one they cannot take, and no scarcity line about places they cannot have. Pressure somebody cannot act on reads as a taunt.",
      ],
      bullets: [],
    },
    {
      id: "what-the-ads-should-hear",
      heading: "What your ad account should be told",
      answer:
        "Not your conversion event. A waitlist sign-up reported as a conversion teaches the auction to find more people who cannot come.",
      paragraphs: [
        "Optimisation events are instructions. Report a timing failure as the same event as a sale and the algorithm will correctly, and expensively, go looking for more of them - and nothing about that looks broken until cost per filled place has already climbed.",
        "Give the waitlist its own event or no event at all. They opted in, so they are in your CRM with full contact details, and that is where the next-cycle list gets built and sent from.",
      ],
      bullets: [],
    },
  ],
};

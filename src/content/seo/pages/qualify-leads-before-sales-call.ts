import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "qualify-leads-before-sales-call",
  kind: "pillar",
  topicId: "pre-call-qualification",
  intent:
    "A founder or sales lead whose calendar is full of calls that go nowhere. They are not shopping for software yet; they want to know how to stop booking the wrong meetings without turning the process into an interrogation.",
  primaryKeyword: "qualify leads before sales call",
  secondaryKeywords: [
    "qualify prospects before demo",
    "qualify leads before booking",
    "pre-call qualification",
  ],
  title: "Qualify Leads Before the Sales Call",
  description:
    "How to move qualification ahead of the booking — which questions to ask, where to put them, and what to do with the people who do not pass.",
  h1: "Assess360 — qualifying every lead before the sales call",
  shortName: "Qualifying before the call",
  lede:
    "Qualifying before the call means asking the questions that decide the outcome before the meeting is booked rather than in its first five minutes. The questions do not change. Only their position does, and that is what frees the calendar.",
  updatedAt: "2026-10-02",
  internalLinks: ["lead-qualification-software", "lead-scoring", "lead-qualification-quiz"],
  sections: [
    {
      id: "the-cost",
      heading: "What an unqualified call actually costs",
      answer:
        "More than the half hour: the preparation, the follow-up, the context switch, and the slot a good prospect could not have.",
      paragraphs: [
        "The last of those is the one that gets missed. A calendar full of unqualified calls does not merely waste time, it crowds out the calls worth having and makes the team slower to respond to the leads that deserve speed. The cost is a worse experience for your best prospects, not just a worse day for your reps.",
      ],
      bullets: [],
    },
    {
      id: "where-to-put-it",
      heading: "Where qualification belongs in the funnel",
      answer:
        "Between the click and the calendar — after someone has shown interest, before they can book a slot.",
      paragraphs: [
        "Putting it earlier, as an ad-level filter, loses people who would have qualified but were not ready to be screened. Putting it later, on the call itself, is where you started. The gap between interest and booking is the only place where someone is motivated enough to answer and nothing has been spent yet.",
      ],
      bullets: [
        "Ad or email click — intent, nothing committed",
        "Assessment — the questions that decide the answer",
        "Qualified: straight to the calendar, with their answers attached",
        "Not qualified: an honest result and a genuinely useful alternative",
      ],
    },
    {
      id: "without-being-rude",
      heading: "How to ask without it feeling like a screening",
      answer:
        "Give the questions a purpose for the respondent — a score, a benchmark, a diagnosis — so answering serves them rather than auditing them.",
      paragraphs: [
        "The same budget question is intrusive on a booking form and reasonable inside an assessment that returns a result, because in the second case the answer is visibly being used for something the respondent wants. This is why assessments outperform qualifying questions bolted onto a calendar embed, which read exactly like what they are.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360-does-it",
      heading: "How Assess360 does it",
      answer:
        "The qualifying questions run as a scored assessment between the click and the calendar, and the people who do not clear the bar get a page of their own rather than a dead end.",
      paragraphs: [
        "Free-text screening fields ride alongside the scored questions — company name, website, what the business actually does — so the ones that slip past a scoring model can be eyeballed by a human before anyone books time with them. Scoring is a model, and models are wrong at the edges.",
        "Qualified leads go straight to your CRM by webhook, or to CSV, with their answers attached. The rep opens the call already knowing what would otherwise have taken the first five minutes to establish.",
      ],
      bullets: [
        "A gate that routes unfit visitors to their own exit page",
        "Scored questions covering problem, scale, timing and role",
        "Free-text screening fields for manual review",
        "Webhook and CSV export, with every answer attached to the lead",
        "A qualified-only conversion event back to the ad platform",
      ],
    },
  ],
  cta: {
    heading: "Put the first five minutes of the call before the booking",
    body:
      "Build the questions into a scored assessment, and let the score decide who reaches your calendar.",
  },
};

import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-coaches",
  kind: "use-case",
  intent:
    "A coach selling a high-ticket programme whose application form produces strategy calls with people who cannot pay for it, wanting to filter on readiness and means before booking.",
  primaryKeyword: "lead qualification for coaches",
  secondaryKeywords: [
    "coaching lead qualification",
    "coaching application form",
    "qualify coaching leads",
    "high ticket coaching qualification",
  ],
  title: "Lead Qualification for Coaches",
  description:
    "How a coach screens applications on readiness, means and commitment before a strategy call, and why a scored application beats a longer form.",
  h1: "Assess360 for coaches: screen applications before the strategy call",
  shortName: "For coaches",
  lede:
    "A high-ticket coaching offer lives or dies on who reaches the strategy call. A scored application asks the three things that decide it - where someone is now, what they can commit, and whether the programme fits - and sends everyone else somewhere honest instead of onto the calendar.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-qualification-quiz", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "readiness",
      heading: "Readiness matters more than interest",
      answer:
        "Interest fills a calendar; readiness fills a programme, and the two are easy to confuse because both arrive as an enthusiastic form submission.",
      paragraphs: [
        "Someone who has wanted this for two years and still has nothing in place is not a buyer, however warm the enquiry reads. Someone mid-way through a problem, with money set aside and a deadline, is. A scored application separates them before anyone spends an hour finding out.",
        "This is also why a longer form does not help. More fields collect more words from the same unready person. The fix is not more questions, it is questions that can end the conversation.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What a coaching application should actually ask",
      answer:
        "Stage, means, time and fit - four facts, each capable of disqualifying on its own.",
      paragraphs: [
        "Means is the uncomfortable one and the one that matters most. It does not have to be asked as a budget question: a band, a current revenue figure, or an honest statement about what has been set aside is enough to score, and it reads as diligence rather than an interrogation.",
      ],
      bullets: [
        "Where are you now, in numbers rather than adjectives",
        "What have you already tried, and what came of it",
        "How many hours a week can you genuinely give this",
        "Have you set money aside for a programme like this",
        "What has to be true in ninety days for this to have been worth it",
      ],
    },
    {
      id: "exit",
      heading: "Where to send an application that does not qualify",
      answer:
        "To a lower-priced product, a waitlist, or a page that says plainly who the programme is for. Never to a booking link.",
      paragraphs: [
        "Letting an unqualified applicant book is the expensive mistake. It costs the hour, it costs the energy, and the refusal at the end of it lands worse on the person than an honest page would have at the start.",
        "On Assess360 the disqualifying answer ends the run before a lead is created, so nothing enters the nurture sequence built for buyers, and the ad platform is told not to look for more people like that one.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Turn your application into a scorecard",
    body: "Score each answer, set the line that means qualified, and let everyone below it land on a page that is useful rather than a calendar that is not.",
  },
};

import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "paperform-alternative",
  kind: "comparison",
  intent:
    "Someone using Paperform for enquiry and booking forms who wants the enquiry to be judged against fit criteria before it reaches a calendar or an inbox.",
  primaryKeyword: "paperform alternative",
  secondaryKeywords: [
    "paperform alternative for lead qualification",
    "alternative to paperform",
    "paperform vs assess360",
  ],
  title: "Paperform Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Paperform: the enquiry is scored and filtered before it becomes a lead or a booking, and the outcome is reported back to your ads.",
  h1: "Assess360 as a Paperform alternative",
  shortName: "vs Paperform",
  factsCheckedOn: "2026-10-06",
  lede:
    "Paperform makes a form feel like a page, which is a genuine advantage when the form is the whole experience. The question it leaves open is what happens to an enquiry that should never have reached your calendar in the first place.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "scorecard"],
  sections: [
    {
      id: "booking",
      heading: "A booking taken is harder to undo than a booking prevented",
      answer:
        "Once an unqualified enquiry holds a slot, somebody has to either sit through it or take it back, and both cost more than a screening question would have.",
      paragraphs: [
        "Putting qualification ahead of the booking step changes the economics of the whole funnel: the calendar stops being first come, first served and starts reflecting who can actually buy.",
      ],
      bullets: [],
    },
    {
      id: "what-it-adds",
      heading: "What scoring adds to a well-made form",
      answer:
        "A number per enquiry, a threshold that defines qualified, a banded result for the respondent, and a signal for the ad platform.",
      paragraphs: [
        "None of that replaces good form design, it sits on top of it. The respondent still gets a clean experience; what changes is that the enquiry has been judged by the time it lands.",
      ],
      bullets: [
        "Weighted categories rather than a flat point total",
        "A gate before the opt-in, so a rejection creates no record",
        "A result page that differs by band",
        "Qualified-only conversion events sent server-side",
      ],
    },
  ],
  cta: {
    heading: "Qualify before the calendar",
    body: "Score the enquiry, route the ones that clear the line to a booking, and give everyone else an honest answer.",
  },
};

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
  factsCheckedOn: "2026-10-09",
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
    {
      id: "beautiful-is-not-the-constraint",
      heading: "When how the form looks stops being the constraint",
      answer: "Paperform wins on the writing experience. That stops mattering when the problem is who is filling it in.",
      paragraphs: [
        "There is a point in most funnels where the form is already good enough and the bottleneck has moved. Nobody is losing deals because the form was not elegant; they are losing time because the enquiries arriving through it are indistinguishable until somebody gets on a call.",
        "That is the moment the question changes from how this form reads to what it refuses, and it is the only moment this product is the better answer.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Paperform",
    source: "published plan pages as summarised by third-party pricing trackers, October 2026",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate. Logic and calculations run inside the form.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Submissions count against the plan.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Calculations can produce a score. No weighted categories with bands.",
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No qualified-only conversion event.",
    },
    {
      label: "Server-side exclusion audience",
      us: "Yes. Server-side exclusion audience via the Conversions API.",
      them: "No server-side exclusion audience.",
    },
    {
      label: "First-party match keys",
      us: "Yes, on every Pixel and CAPI event.",
      them: "Standard pixel integrations.",
    },
    {
      label: "Custom domain",
      us: "Yes, from $79/mo.",
      them: "Available on paid plans.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "Around $24 to $29/mo on Essentials, per user, with 100 submissions.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Paperform is the nicest writing experience in form building: a form is a document you type, and for bookings, orders and payment flows that is a genuinely lovely way to work. If your need is an elegant form that takes money or books time, it is a better tool than this one and cheaper at the entry tier. It is simply not trying to decide who deserves a sales conversation.",
  faqs: [
    {
      q: "Paperform does calculations. Isn't that scoring?",
      a: "It can produce a number, yes. What it does not have is weighted categories with their own bands, a qualified threshold, and a result page that tells the respondent where they stand on each dimension. A score you cannot interpret is a number, not a scorecard.",
    },
    {
      q: "Can I take payments like Paperform does?",
      a: "Yes, through the respondent payment step, though it is narrower: one payment on one funnel, not Paperform's full order-form capability. If taking money is the main job, Paperform does it better.",
    },
    {
      q: "What actually moves my cost per qualified lead?",
      a: "The qualified-only conversion event and the exclusion audience, more than the gate itself. The gate protects your calendar; those two stop the ad account from buying more of the people it just filtered out.",
    },
  ],
  cta: {
    heading: "Qualify before the calendar",
    body: "Score the enquiry, route the ones that clear the line to a booking, and give everyone else an honest answer.",
  },
};

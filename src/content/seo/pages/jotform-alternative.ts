import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "jotform-alternative",
  kind: "comparison",
  intent:
    "Someone running enquiry intake on Jotform who has the submissions but still has to triage them by hand, and wants the triage built into the form itself.",
  primaryKeyword: "jotform alternative",
  secondaryKeywords: [
    "jotform alternative for lead qualification",
    "alternative to jotform",
    "jotform vs assess360",
  ],
  title: "Jotform Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Jotform: enquiries are scored against your criteria and filtered before they become leads, instead of arriving as submissions to triage.",
  h1: "Assess360 as a Jotform alternative",
  shortName: "vs Jotform",
  factsCheckedOn: "2026-10-09",
  lede:
    "Jotform is a general-purpose form builder with an enormous range, and it will collect anything you can think to ask. What it leaves you with is a queue of submissions, and somebody has to decide which of them deserve an hour.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "triage",
      heading: "The cost is in the triage, not the form",
      answer:
        "Building the form takes an afternoon; reading every submission to find the good ones takes a slice of every week, forever.",
      paragraphs: [
        "Scoring moves that judgement to the moment the scorecard is built. The rule is written once, applied identically to everyone, and the enquiries arrive already ranked instead of arriving as a queue.",
      ],
      bullets: [],
    },
    {
      id: "before-not-after",
      heading: "Filtering before the record exists",
      answer:
        "A disqualifying answer can end the visit before contact details are captured, which a form cannot do because capture is the point.",
      paragraphs: [
        "That difference matters for data as much as for time: no record means nothing to store, nothing to secure, and nothing entering a nurture sequence that was built for buyers.",
      ],
      bullets: [
        "Points per answer and weighted categories, not conditional routing alone",
        "Bands that give each score a written meaning for the respondent",
        "A result page worth answering honestly for",
        "Qualification reported to the ad platform that paid for the click",
      ],
    },
    {
      id: "fit",
      heading: "When a form builder is the right answer",
      answer:
        "For registrations, bookings, uploads, internal processes and anything where every submission is wanted.",
      paragraphs: [
        "Most of what a form builder is used for has nothing to do with qualification, and for those jobs a broad form tool is the better choice by a distance.",
      ],
      bullets: [],
    },
    {
      id: "where-logic-stops",
      heading: "Where conditional logic stops being enough",
      answer: "Logic decides what a respondent sees. It cannot decide that they should not have become a lead.",
      paragraphs: [
        "Every serious form builder has branching, and it solves a real problem: not asking people questions that do not apply to them. What it cannot do is operate before the form, because by the time logic runs the person is inside it and usually identified.",
        "That ordering is the whole difference. A disqualification after the opt-in produces a lead you have to filter, store, and explain to whoever counts leads. A disqualification before it produces nothing at all.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Jotform",
    source: "published plan pages as summarised by third-party pricing trackers, October 2026",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No pre-opt-in gate. Conditional logic runs inside the form, after the visitor is in it.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Every submission counts against the plan.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Form calculations can produce a number. No weighted categories with their own bands.",
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
      them: "$39/mo Bronze, with 25 forms and 1,000 submissions. Far more form for the money.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Jotform is an enormous, genuinely good form builder, and on raw capability per rupee almost nothing competes with it: payments, approvals, signatures, HIPAA options, thousands of templates. If your problem is that you need many forms doing many jobs across a business, Jotform is the right answer and this is not. It stops being the right answer at precisely one point, which is when you need some people not to become leads at all.",
  faqs: [
    {
      q: "Jotform has conditional logic. Isn't that the same as a gate?",
      a: "No, and the difference is where it sits. Conditional logic hides and shows questions once somebody is already in the form. A gate decides whether they reach the form in the first place, and a visitor who fails it leaves no lead, no submission and nothing to delete later.",
    },
    {
      q: "Can Jotform report qualified leads separately to Meta?",
      a: "Not as a distinct conversion event. A submission is a submission, so the ad platform optimises toward whoever fills the form in fastest. That is the loop this product exists to break.",
    },
    {
      q: "I use Jotform for lots of other things. Do I have to leave?",
      a: "No, and most people do not. Keep Jotform for the forms it is good at and move the one funnel that feeds your sales calendar. They are different jobs.",
    },
  ],
  cta: {
    heading: "Move the triage into the form",
    body: "Score the answers, set the line, and let the enquiries arrive sorted rather than stacked.",
  },
};

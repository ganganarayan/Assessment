import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "typeform-alternative",
  kind: "comparison",
  intent:
    "Someone using Typeform as their enquiry or application form who is now reading every submission by hand to decide who is worth a call, and wants that decision made before the submission arrives.",
  primaryKeyword: "typeform alternative",
  secondaryKeywords: [
    "typeform alternative for lead qualification",
    "alternative to typeform",
    "typeform vs assess360",
  ],
  title: "Typeform Alternative for Lead Qualification",
  description:
    "How Assess360 differs from Typeform: answers are scored against your criteria and wrong-fit respondents stop before the opt-in.",
  h1: "Assess360 as a Typeform alternative",
  shortName: "vs Typeform",
  factsCheckedOn: "2026-10-09",
  lede:
    "Typeform is one of the best-made form builders there is, and a form's job is to collect answers and hand them over. The problem it leaves you is the one that costs money: somebody still has to read every submission and decide who is worth an hour.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "collect-vs-evaluate",
      heading: "Collecting answers and evaluating them are different jobs",
      answer:
        "A form hands you what people said; a scorecard tells you what it means against criteria you set in advance.",
      paragraphs: [
        "This is the whole distinction, and it is easy to miss because both start with questions. With a form, the judgement happens afterwards, by a person, inconsistently, on every single submission. With scoring, the judgement was made once when the scorecard was built and is then applied identically to everyone.",
        "That consistency is worth more than it sounds. Two people reading the same enquiry on different days do not reach the same conclusion, and neither remembers the rule they used last month.",
      ],
      bullets: [],
    },
    {
      id: "what-you-get",
      heading: "What changes when the answers are scored",
      answer:
        "Wrong-fit respondents can be stopped before they become a lead, and the right ones arrive already ranked.",
      paragraphs: [
        "The respondent's experience changes too. Instead of a thank-you screen, they get a result that tells them where they stand, which is the thing that makes people answer honestly in the first place.",
      ],
      bullets: [
        "Points per answer and weights per category, not a flat total",
        "A gate before the opt-in, so a disqualifying answer leaves no lead record",
        "A result page that differs by band, written once and shown to the right people",
        "Qualification reported back to Meta, so campaigns optimise on buyers",
      ],
    },
    {
      id: "when-typeform-wins",
      heading: "When a form is the right tool",
      answer:
        "For surveys, feedback, applications you intend to read individually, and anything where there is no right answer to score against.",
      paragraphs: [
        "If you are not sorting people into better and worse fits, scoring adds nothing, and a well-designed form is the simpler choice. Assess360 earns its place when the volume of enquiries exceeds the hours available to read them.",
      ],
      bullets: [],
    },
    {
      id: "keeping-both",
      heading: "Most people keep Typeform and move one funnel",
      answer: "This is rarely an all-or-nothing switch, and treating it as one is how it stalls.",
      paragraphs: [
        "The pattern that works is narrow: leave every survey, every feedback form and every internal request where it is, and move only the funnel that paid traffic lands on. That is one form, usually, and it is the one where a wrong-fit submission costs an hour instead of a row in a spreadsheet.",
        "It also makes the comparison honest. Typeform is not losing a competition it was never entered into; it keeps doing the job it is best at, and the one form whose job is to say no moves somewhere built to say it.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  comparison: {
    competitor: "Typeform",
    source: "read from their own pricing page on 9 October 2026. Several vendors price by region, so the figure you are shown may differ",
    rows: [
    {
      label: "Gate runs before the opt-in",
      us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
      them: "No. Logic can hide questions, but the respondent is already in the form.",
    },
    {
      label: "Are disqualified visitors metered?",
      us: "Never. Only qualified responses count against the plan.",
      them: "Every response counts against the plan.",
    },
    {
      label: "Weighted category scoring",
      us: "Yes. Weighted categories, a weighted total, and named result bands.",
      them: "Basic scoring with logic jumps. No weighted categories or result bands.",
    },
    {
      label: "Qualified-only conversion event",
      us: "Yes. Qualified completions fire their own conversion event.",
      them: "No. All submissions report as one event.",
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
      them: "Custom subdomain from the Plus plan.",
    },
    {
      label: "Entry price",
      us: "$39/mo, or $32 billed annually.",
      them: "$28/mo Basic, $56/mo Plus on their own page. Cheaper than us for forms, and by more than it used to be.",
      themWins: true,
    },
    ],
  },
  betterWhen:
    "Typeform is the best-looking form builder there is, and it is not close. If what you need is a beautiful survey, a research questionnaire, an application form or anything where every respondent is welcome, use Typeform and enjoy it. Its logic, its integrations and its polish are all ahead of ours. It becomes the wrong tool only at the point where you need some respondents to be turned away before they become a lead.",
  faqs: [
    {
      q: "Can Typeform disqualify people?",
      a: "It can end a form early and send someone to a different ending, which looks similar and is not the same thing. The respondent has usually already given you their email by then, so the lead exists, it is in your CRM, and it counts against your plan. The gate here runs before the opt-in, so there is nothing to clean up.",
    },
    {
      q: "Is this a Typeform replacement for my whole account?",
      a: "Probably not, and we would not suggest it. Most people who switch keep Typeform for surveys and feedback and move only the lead-generating funnel across. The two jobs are genuinely different and one tool being better at one of them is not an argument about the other.",
    },
    {
      q: "What about the look of it?",
      a: "Typeform wins on polish and we are not going to pretend otherwise. Our result pages are built around saying something useful to the respondent rather than around the animation between questions.",
    },
  ],
  cta: {
    heading: "Score the form you already have",
    body: "Rebuild your enquiry as a scorecard, set the line that means qualified, and stop reading submissions to find out who to call.",
  },
};

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
  factsCheckedOn: "2026-10-06",
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
  ],
  cta: {
    heading: "Score the form you already have",
    body: "Rebuild your enquiry as a scorecard, set the line that means qualified, and stop reading submissions to find out who to call.",
  },
};

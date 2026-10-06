import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-consultants",
  kind: "use-case",
  intent:
    "An independent consultant or boutique firm fielding enquiries that turn out to have no sponsor, no budget line and no decision date, wanting to establish those before the first meeting.",
  primaryKeyword: "lead qualification for consultants",
  secondaryKeywords: [
    "consulting lead qualification",
    "qualify consulting prospects",
    "consulting lead scoring",
    "consultant enquiry form",
  ],
  title: "Lead Qualification for Consultants",
  description:
    "How consultants establish sponsor, budget line and decision date before the first meeting, and why scoping questions belong on the enquiry rather than the call.",
  h1: "Assess360 for consultants: scope the enquiry before you meet",
  shortName: "For consultants",
  lede:
    "Consulting enquiries fail on process, not on interest. There is no sponsor, no budget line this year, or a decision that was never going to be made by the person who wrote in. All three are askable on a form, and together they decide whether a meeting is worth anyone's morning.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "sponsor",
      heading: "No sponsor means no project, however good the conversation",
      answer:
        "An enquiry with no named internal sponsor is usually a research exercise being run on your time.",
      paragraphs: [
        "This is the most reliable predictor in consulting work and also the easiest to establish early. Asking who inside the organisation is pushing for this, and what happens if nothing is done, separates a live initiative from an idea one interested person is exploring.",
        "The second question matters as much as the first. A problem with no consequence attached to inaction has no deadline, and a project with no deadline does not get funded.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "Scoping questions that belong on the enquiry form",
      answer:
        "The ones whose answers decide whether this is a project at all, rather than the ones that shape the proposal.",
      paragraphs: [
        "Proposal-shaping questions need a conversation. Project-existence questions do not, and asking them first means the meeting starts from a shared understanding of scale instead of arriving at it in the last ten minutes.",
      ],
      bullets: [
        "Who inside the organisation is sponsoring this",
        "Is there a budget line for it this year, or is that the next step",
        "What is the decision date, and what drives it",
        "Has anyone been engaged on this before",
        "Who else has to agree before work can start",
      ],
    },
    {
      id: "score",
      heading: "Score a consulting enquiry rather than reading it",
      answer:
        "Weighted scoring makes two enquiries comparable, which a paragraph of free text never is.",
      paragraphs: [
        "Most consulting enquiry forms end in a description box, and the quality of what comes back depends on how articulate the writer is. Scoring structured answers instead means an inarticulate enquiry from a funded programme outranks an eloquent one with no sponsor, which is the correct order.",
        "Assess360 weights categories independently, so authority can count for more than enthusiasm without anyone having to remember to apply that judgement by hand each time.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Ask the three questions that decide the project",
    body: "Put sponsor, budget line and decision date on the enquiry, score them, and meet the enquiries that clear the line.",
  },
};

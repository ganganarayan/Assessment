import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "assessment-software",
  kind: "pillar",
  topicId: "assessment-software",
  intent:
    "Someone who has decided they want an assessment and is now choosing a tool to build it with. They want to know what the software has to do, how much of the work it does for them, and where the limits are.",
  primaryKeyword: "assessment software",
  secondaryKeywords: [
    "online assessment software",
    "interactive assessment software",
    "lead assessment software",
    "personalized assessment",
  ],
  title: "Assessment Software: What to Look For",
  description:
    "What assessment software has to do beyond asking questions - scoring, branching, result pages and hosting - and how to tell a quiz builder from a qualification tool.",
  h1: "Assess360: assessments built to qualify, not just to score",
  shortName: "Assessment software",
  lede:
    "Assessment software builds, hosts and scores a structured set of questions, then returns a result to the person who answered them. Almost every tool can do that part. Assess360 is an assessment tool built for one job beyond it - qualifying leads, on every enquiry, by several methods working together rather than a score alone.",
  updatedAt: "2026-10-02",
  internalLinks: ["lead-qualification-software", "scorecard"],
  sections: [
    {
      id: "what-it-has-to-do",
      heading: "Assess360 scores the answers, it does not just collect them",
      answer:
        "Four things: ask the questions, score the answers, decide what the score means, and show the respondent a result worth the time they spent.",
      paragraphs: [
        "Tools that stop after the first of those are form builders with better styling. Scoring and interpretation are where an assessment stops being a data-collection exercise and becomes something the respondent gets value from - which is also, not coincidentally, what makes people answer honestly rather than optimistically.",
      ],
      bullets: [
        "A question editor with real answer types, not only text fields",
        "Points per answer and weights per category",
        "Bands or thresholds that turn a number into a meaning",
        "A hosted result page, so nothing has to be rebuilt on your own site",
      ],
    },
    {
      id: "branching",
      heading: "Assess360 asks each person only the questions that apply to them",
      answer:
        "Conditional logic lets you ask fewer questions of each person while covering more ground overall, because nobody sees the questions that do not apply to them.",
      paragraphs: [
        "A flat twenty-question assessment and a branching one that asks eight relevant questions can gather the same decision-grade information. The branching version gets finished. This is the largest single lever on completion rate, and it is worth checking before anything cosmetic.",
      ],
      bullets: [],
    },
    {
      id: "ai-questions",
      heading: "Assess360 drafts your questions with AI, you keep the scoring",
      answer:
        "AI is good at producing a first draft of questions and answer options in minutes; it is not good at knowing which answers should score well for your business.",
      paragraphs: [
        "Treat generated questions as a starting point to edit, not output to publish. The scoring is the part that encodes your judgement about what a good customer looks like, and that judgement is the asset - it is not something a model can infer from a prompt about your industry.",
      ],
      bullets: [],
    },
    {
      id: "how-assess360-does-it",
      heading: "Where Assess360 fits in the qualification loop",
      answer:
        "Draft the questions with AI, edit them, set the points and weights yourself, and publish to a hosted link that scores every answer and returns a personalised result.",
      paragraphs: [
        "The division of labour is deliberate. Generation handles the part that is tedious and generic - a first pass at questions and answer options - while the scoring, the weights and the bands stay yours, because those encode what a good customer looks like for your business and nothing can infer that from a prompt.",
        "Result reports can be written by AI too, using your own OpenAI, Claude or Gemini key rather than ours. That keeps the model choice and the cost with you, and the reports are generated under your own account rather than pooled through someone else's.",
      ],
      bullets: [
        "AI-drafted questions and options, edited by you",
        "Conditional branching, so each person sees only what applies",
        "Points per answer and weights per category",
        "Named result bands, each with its own interpretation",
        "Hosted result pages plus a branded PDF",
        "AI-written reports using your own provider key",
      ],
    },
  ],
  cta: {
    heading: "Draft your assessment, then make the scoring yours",
    body:
      "Generate a first pass of the questions, edit them, and set the scoring that reflects what actually predicts a good customer for you.",
  },
};

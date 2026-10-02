import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-an-online-assessment",
  question: "How do I use an assessment to qualify leads?",
  short:
    "You put the questions a rep would ask into a scored assessment, so the respondent gets a result worth having and you get a verdict on whether they fit, before anyone books a call.",
  topicId: "assessment-software",
  primaryKeyword: "use an assessment to qualify leads",
  secondaryKeywords: ["online assessment meaning", "assessment vs survey"],
  related: ["how-long-should-an-assessment-be", "what-is-an-online-scorecard"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "not-a-survey",
      heading: "How it differs from a survey",
      answer:
        "A survey aggregates across respondents to tell you about a population; an assessment evaluates one respondent and tells them about themselves.",
      paragraphs: [
        "That changes who the output is for. Survey results go to the organisation that ran it. Assessment results go to the person who took it, and the organisation gets the scored record as a by-product. Build one expecting the other and the questions will be wrong in both directions.",
      ],
      bullets: [],
    },
    {
      id: "when-to-use-one",
      heading: "When an assessment is the right format",
      answer:
        "When the person genuinely does not know where they stand, and the answer is something you can determine from a dozen questions.",
      paragraphs: [
        "If the result is obvious to the respondent before they start, the format adds friction without adding value — a form would have been more honest. The format earns its length when the scoring tells them something they could not have worked out alone.",
      ],
      bullets: [],
    },
  ],
};

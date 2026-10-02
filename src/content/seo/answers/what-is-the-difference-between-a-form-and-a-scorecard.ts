import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-the-difference-between-a-form-and-a-scorecard",
  question: "What is the difference between a form and a scorecard?",
  short:
    "A form collects answers and hands them to you unread, while a scorecard evaluates those same answers against your criteria and returns a score, a verdict and a next step.",
  topicId: "lead-qualification",
  primaryKeyword: "difference between a form and a scorecard",
  secondaryKeywords: ["online scorecard vs form", "assessment vs form"],
  related: ["what-is-lead-qualification-software"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "what-changes",
      heading: "What changes when answers are scored",
      answer:
        "With a form you learn how to contact someone; with a scorecard you learn whether you should.",
      paragraphs: [
        "The mechanical difference is small — both ask questions — but the output is not. A form produces a row of data that someone has to interpret. A scorecard applies the interpretation at submission time, which means routing, prioritisation and disqualification can happen automatically rather than in somebody's inbox three days later.",
      ],
      bullets: [],
    },
    {
      id: "what-the-respondent-gets",
      heading: "What the respondent gets back",
      answer:
        "A form usually ends in a thank-you page; a scorecard ends in a result the person actually wanted.",
      paragraphs: [
        "That difference is why completion rates tend to hold up on a longer scorecard than on a shorter form: the questions buy the respondent something. The exchange is explicit — answer honestly, get a reading on where you stand.",
      ],
      bullets: [],
    },
  ],
};

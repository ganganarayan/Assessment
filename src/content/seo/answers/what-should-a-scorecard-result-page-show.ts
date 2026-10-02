import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-should-a-scorecard-result-page-show",
  question: "What should a scorecard result page show?",
  short:
    "The score, what that score means in words specific to the band it falls in, where the points were lost, and one next step that matches the result rather than the sale you want.",
  topicId: "scorecards",
  primaryKeyword: "scorecard result page",
  secondaryKeywords: ["assessment results page", "quiz results page design"],
  related: ["what-is-an-online-scorecard", "should-i-let-unqualified-leads-book-a-call"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "bands",
      heading: "Why bands beat a single paragraph",
      answer:
        "One interpretation written for everyone will fit nobody, and respondents can tell immediately.",
      paragraphs: [
        "Three or four bands, each with its own writing and its own recommendation, is usually enough. The test is whether someone scoring 30 and someone scoring 85 would get pages that are recognisably different documents rather than the same page with a different number at the top.",
      ],
      bullets: [],
    },
    {
      id: "dont-gate-it",
      heading: "Do not hold the result hostage",
      answer:
        "Gating the score behind an email form after the person has already answered your questions is the fastest way to make the whole exercise feel like a trick.",
      paragraphs: [
        "Collect the email as part of the flow if you need it, and then show the result. The respondent has paid for the result in answers already; charging them twice is what turns a well-received assessment into a complaint.",
      ],
      bullets: [],
    },
  ],
};

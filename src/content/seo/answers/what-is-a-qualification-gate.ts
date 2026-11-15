import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-a-qualification-gate",
  question: "What is a qualification gate?",
  short:
    "A qualification gate is a few short questions placed before a quiz or a form that decide whether a person should continue at all, so people who cannot be helped are turned away before they become a lead.",
  topicId: "pre-call-qualification",
  primaryKeyword: "qualification gate",
  secondaryKeywords: ["lead qualification gate", "pre-qualification questions", "screening questions before a quiz"],
  related: [
    "should-i-put-a-qualification-gate-before-my-quiz",
    "will-a-qualification-gate-reject-good-leads",
    "how-do-i-exclude-unqualified-leads-from-meta-ads",
  ],
  updatedAt: "2026-11-15",
  body: [
    {
      id: "gate-vs-form",
      heading: "How a gate differs from a long form",
      answer:
        "A form collects everything and leaves the judging to a person later; a gate judges first, using a handful of answers that each carry points, plus a few answers that end it outright.",
      paragraphs: [
        "People who pass go on to the full quiz or assessment. People who do not see a page that tells them honestly why, and where to go instead, rather than being left waiting for a call that will never be worth making.",
      ],
      bullets: [],
    },
    {
      id: "why-ads",
      heading: "Why a gate matters for paid ads",
      answer:
        "Ad platforms learn from whoever you report as a lead, so a gate that reports only qualified people teaches the platform to find more of them and fewer of the rest.",
      paragraphs: [
        "Without a gate, every form fill counts as a success to the ad platform, including the ones your team will never call back. The platform then spends your budget finding more people like them.",
      ],
      bullets: [],
    },
    {
      id: "what-it-is-not",
      heading: "What a qualification gate is not",
      answer:
        "It is not a captcha and not a spam filter: it removes people who are real but wrong for you, which a spam filter cannot see.",
      paragraphs: [],
      bullets: [],
    },
  ],
};

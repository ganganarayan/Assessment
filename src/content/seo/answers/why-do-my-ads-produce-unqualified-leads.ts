import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "why-do-my-ads-produce-unqualified-leads",
  question: "Why do my ads produce unqualified leads?",
  short:
    "Because the ad platform optimises for whatever you tell it counts as a conversion, and if a submitted form counts, it will reliably find you people who submit forms rather than people who buy.",
  topicId: "lead-qualification",
  primaryKeyword: "why do my ads produce unqualified leads",
  secondaryKeywords: ["stop unqualified leads from ads", "unqualified leads from facebook ads"],
  related: ["how-do-i-qualify-leads-before-a-sales-call", "what-is-lead-qualification-software"],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "the-feedback-loop",
      heading: "The algorithm is learning from the wrong signal",
      answer:
        "An ad platform optimises toward the event you report, so reporting every form fill teaches it to find form-fillers.",
      paragraphs: [
        "The loop is doing exactly what it was built to do. It sees which people completed the event, builds a model of who they resemble, and goes looking for more of them. If the event fires for everyone who submits, the model it learns is a model of submitters - a group that overlaps with your buyers only partly, and sometimes barely.",
      ],
      bullets: [],
    },
    {
      id: "what-fixes-it",
      heading: "What changes it",
      answer:
        "Report a conversion only when someone passes your qualification bar, so the platform optimises toward buyers instead of toward respondents.",
      paragraphs: [
        "The second half matters as much as the first: tell the platform about the people who did not qualify, too, as an exclusion signal. One list stops you paying to reach people who will never fit; the other sharpens who it looks for. Both are built from the same qualification step.",
      ],
      bullets: [
        "A qualified-only conversion event, so optimisation follows fit rather than volume",
        "An exclusion audience built from the visitors who failed the bar",
        "A retargeting audience built from the ones who passed",
      ],
    },
  ],
};

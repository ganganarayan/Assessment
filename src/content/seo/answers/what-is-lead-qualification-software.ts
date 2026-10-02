import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "what-is-lead-qualification-software",
  question: "What is lead qualification software?",
  short:
    "Lead qualification software scores each incoming enquiry against your own fit criteria and tells you which ones are worth a sales conversation, before anyone picks up the phone.",
  topicId: "lead-qualification",
  primaryKeyword: "what is lead qualification software",
  secondaryKeywords: ["lead qualification software definition", "prospect qualification software"],
  related: [
    "what-is-the-difference-between-a-form-and-a-scorecard",
    "how-do-i-qualify-leads-before-a-sales-call",
  ],
  updatedAt: "2026-10-02",
  body: [
    {
      id: "what-it-does",
      heading: "What it actually does",
      answer:
        "It asks a prospect a short set of questions, scores their answers against criteria you define, and returns a verdict - qualified, not qualified, or somewhere in between - along with the reasoning.",
      paragraphs: [
        "The criteria are yours, not the vendor's. A recruitment firm might weight hiring volume and time-to-fill; a clinic might weight treatment type and distance from the practice. The software supplies the scoring mechanism and the hosting; you supply the definition of a good customer.",
      ],
      bullets: [
        "Points per answer, so a near-miss scores differently from a dealbreaker",
        "Weights per category, so budget can matter more than, say, team size",
        "A score threshold that decides what counts as qualified",
      ],
    },
    {
      id: "when-it-is-not-the-answer",
      heading: "When it is not the right tool",
      answer:
        "If you cannot yet articulate what separates a good customer from a bad one, qualification software will faithfully automate a definition you have not agreed on.",
      paragraphs: [
        "It is also the wrong tool when enquiry volume is low enough to read every one by hand. The value comes from volume: the point at which reading every enquiry costs more than the enquiries are worth. Below that, a spreadsheet is honest and free.",
      ],
      bullets: [],
    },
  ],
};

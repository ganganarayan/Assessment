import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "should-i-put-a-qualification-gate-before-my-quiz",
  question: "Should I put a qualification gate before my quiz, or run the quiz on its own?",
  short:
    "Gate it when wrong-fit people cost you something, such as a sales call, ad spend or a seat, and run it on its own when everyone who finishes is worth keeping and you only want to know where each one stands.",
  topicId: "quiz-funnels",
  primaryKeyword: "qualification gate before quiz",
  secondaryKeywords: ["quiz without a gate", "gated quiz funnel", "scored quiz for lead generation"],
  related: [
    "what-is-a-qualification-gate",
    "will-a-qualification-gate-reject-good-leads",
    "what-is-a-quiz-funnel",
  ],
  updatedAt: "2026-11-15",
  body: [
    {
      id: "when-to-gate",
      heading: "When a gate before the quiz is right",
      answer:
        "When every lead costs money or a person's time, and a few facts end the conversation outright before any score could matter.",
      paragraphs: [
        "A gate is a few short questions in front of the quiz. People who cannot be helped are turned away there, before they become a lead, so they never reach a sales call or the ad platform's idea of a good customer.",
      ],
      bullets: [
        "You pay for every lead, through ads or through a person who calls them back",
        "A few answers end it: the wrong country, no budget authority, a service you do not offer",
        "You want Meta to learn from qualified people only, not from everyone who filled in a form",
      ],
    },
    {
      id: "when-not-to-gate",
      heading: "When the quiz on its own is right",
      answer:
        "When the quiz is the product people came for, and every finisher is someone you want on your list, sorted by score afterwards.",
      paragraphs: [
        "A self-assessment, a readiness check or a scorecard people take for their own answer works without a gate. Turning people away would only cost you finishers you were happy to keep.",
      ],
      bullets: [
        "The quiz itself is the offer, not a step before a sales call",
        "You want every finisher, and you sort them by score and band afterwards",
        "Your traffic is already well matched, such as your own email list or referrals",
      ],
    },
    {
      id: "how-assess360-does-it",
      heading: "Assess360 runs either way, per funnel",
      answer:
        "The gate is optional on every funnel: set it up and a few questions come first, leave it off and people go straight into the scored quiz.",
      paragraphs: [
        "Either way every answer carries points, the total lands in a result band you name, and the result page and report follow from the band. You can run a gated funnel and an ungated one side by side and compare them on the Stats page, which counts visits, gate passes, people turned away, opt-ins and completions for each.",
      ],
      bullets: [],
    },
  ],
};

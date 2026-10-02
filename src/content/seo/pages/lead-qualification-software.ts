import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-software",
  kind: "pillar",
  topicId: "lead-qualification",
  intent:
    "Someone with more enquiries than they can work, looking for a category of tool rather than a brand. Commercial research: they want to know what this software does, how it differs from forms and CRMs, and what to look for before shortlisting.",
  primaryKeyword: "lead qualification software",
  secondaryKeywords: [
    "lead qualification platform",
    "lead qualification tool",
    "automated lead qualification",
    "lead filtering software",
    "filter unqualified leads",
  ],
  title: "Lead Qualification Software: How It Works",
  description:
    "What lead qualification software does, how scoring and weighting work, how it differs from a form or a CRM field, and what to check before you choose one.",
  h1: "Lead qualification software",
  lede:
    "Lead qualification software scores every enquiry against criteria you define and decides which ones deserve a sales conversation. The useful ones do three things: score answers rather than collect them, let you weight what actually predicts a good customer, and act on the result automatically.",
  updatedAt: "2026-10-02",
  internalLinks: [],
  sections: [
    {
      id: "how-it-works",
      heading: "How lead qualification software works",
      answer:
        "A prospect answers a short set of questions, each answer carries a score you set, categories are weighted against each other, and the total is compared to a threshold that decides what qualified means.",
      paragraphs: [
        "Nothing in that chain is clever on its own. What makes it useful is that the judgement happens at submission time instead of in somebody's inbox, which is what lets routing, prioritisation and disqualification be automatic rather than a daily chore nobody has time for.",
      ],
      bullets: [
        "Points per answer, so a near-miss and a dealbreaker are not treated alike",
        "Weights per category, so the thing that predicts a good customer counts for more",
        "A threshold, so qualified has a definition rather than a feeling",
        "A result for the respondent, so the questions buy them something too",
      ],
    },
    {
      id: "filtering",
      heading: "Filtering unqualified leads before they enter the pipeline",
      answer:
        "The strongest version of this does not score the wrong-fit enquiry at all — it screens them out at the door, before a lead record exists.",
      paragraphs: [
        "Scoring everyone and ignoring the low scores still means storing them, counting them and looking at them. Screening first means a visitor who fails a hard criterion — wrong role, wrong region, no budget — is routed to an exit page and never becomes a lead at all. Your pipeline then contains only people who cleared the bar, and your reporting stops averaging in the noise.",
        "It also changes what the number at the top of your dashboard means. Conversion rate on qualified enquiries is a figure you can act on; conversion rate on everything who touched a form is a figure that moves when your traffic mix changes.",
      ],
      bullets: [],
    },
    {
      id: "what-to-look-for",
      heading: "What to check before you choose one",
      answer:
        "Look at who defines the criteria, what happens to the people who fail them, and whether the tool can report qualification back to wherever your traffic comes from.",
      paragraphs: [
        "Most tools in this category can ask questions and add up numbers. The differences that matter in practice show up after the score exists: whether a disqualified visitor costs you anything, whether the result is something the respondent values, and whether your ad platform ever learns which leads were any good.",
      ],
      bullets: [
        "Can you weight categories, or only score individual answers?",
        "Does a disqualified visitor count against your plan's limits?",
        "Can qualification be reported back to your ad platform as a conversion?",
        "Does the respondent get a result worth the time they spent?",
      ],
    },
  ],
  cta: {
    heading: "Build a scorecard and see what your enquiries are actually worth",
    body:
      "Define your criteria, weight what matters, and put it in front of real traffic. A 14-day Signal trial, no card.",
  },
};

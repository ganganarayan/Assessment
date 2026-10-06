import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "scoreapp-alternative",
  kind: "comparison",
  intent:
    "Someone already running or evaluating ScoreApp for lead generation, who now needs the scorecard to filter traffic and report lead quality back to the ad platform rather than only grow a list.",
  primaryKeyword: "scoreapp alternative",
  secondaryKeywords: [
    "scoreapp alternative for lead qualification",
    "alternative to scoreapp",
    "scoreapp vs assess360",
  ],
  title: "ScoreApp Alternative for Lead Qualification",
  description:
    "How Assess360 differs from ScoreApp: a gate that runs before the opt-in, weighted scoring, and a qualified-only event sent back to your ads.",
  h1: "Assess360 as a ScoreApp alternative",
  shortName: "vs ScoreApp",
  factsCheckedOn: "2026-10-06",
  lede:
    "ScoreApp is a scorecard builder aimed at lead generation: ask questions, give a score, collect the lead. Assess360 is built for the step after that, where some of those leads should never have become leads at all, and where the ad platform needs to be told which ones were worth having.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "meta-ads-lead-qualification", "scorecard"],
  sections: [
    {
      id: "what-scoreapp-is-for",
      heading: "What ScoreApp is built for",
      answer:
        "Turning a scorecard into a lead magnet: an engaging set of questions, a personalised result, and a list that grows faster than a plain opt-in would.",
      paragraphs: [
        "That is a real job and it is done well. If the goal is to put a scorecard in front of an audience and capture more enquiries than a static form would, a tool built around that goal is a sensible choice.",
      ],
      bullets: [],
    },
    {
      id: "what-assess360-adds",
      heading: "What Assess360 is built around instead",
      answer:
        "Removing the leads you do not want before they exist, and telling the ad platform which of the rest were worth paying for.",
      paragraphs: [
        "The difference shows up when you are buying traffic. A scorecard that captures everybody hands the sales team a larger list with the same proportion of wrong-fit people in it, and the campaign keeps optimising towards whoever fills in forms.",
      ],
      bullets: [
        "A qualification gate runs BEFORE the opt-in, so a disqualifying answer creates no lead record at all",
        "Weighted category scoring with bands, so a score means something specific rather than a total",
        "A qualified-only conversion event sent server-side, so campaigns optimise on buyers",
        "An exclusion signal for the people turned away, which carries no personal data",
        "Your own domain, and a workspace per business if you run more than one",
      ],
    },
    {
      id: "who-should-not-switch",
      heading: "When ScoreApp is the better choice",
      answer:
        "If the goal is list growth and engagement rather than filtering, a tool built for that is a better fit than one built to turn people away.",
      paragraphs: [
        "Assess360 is opinionated: it exists to reduce the number of leads you receive and raise what each one is worth. If you are not running paid traffic, not short of sales hours, and genuinely want every enquiry, that opinion works against you.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Try the qualification version",
    body: "Build the same scorecard with a gate in front of it, and see what happens to the lead count and to the calls that follow.",
  },
};

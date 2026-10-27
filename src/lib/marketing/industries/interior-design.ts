import { defineIndustry } from "./define";

/**
 * Interior design studios. The signature leak is the free concept: a designer
 * produces a layout and a render, the client takes it to a contractor, and the
 * studio has paid to furnish somebody else's job.
 */
export const INTERIOR_DESIGN = defineIndustry({
  key: "interior-design",
  shortName: "Interior design",
  category: "Interior design",
  keywordSlug: null,
  cardLine: "Possession, budget and timeline, settled before a designer draws anything.",
  meta: {
    title: "Lead qualification for interior design studios",
    description:
      "A free concept is a designer's week given to somebody who will hand it to a contractor. Assess360 settles possession, budget and timeline before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody gets a free concept. And your ads learn to stop finding the people who ask for one.",
    sub: "Whether they have possession, the budget band for the whole job and when work can actually start are settled before the opt-in, so your designers stop producing layouts for people who were collecting ideas. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the signed project",
  businesses: "studios",
  rivals: "the studios quoting against you",
  promiseWords:
    "an assessment, a design consultation, a space audit, a style quiz, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never fund a project",
  leak: {
    lead: "The expensive enquiry in this business is not the one that says no, it is the one that says yes to a free concept. A designer gives it a week, the client takes the layout to a carpenter, and you paid for the click as well. Here is what that costs every month.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 120,
    outcomesLabel: "Projects signed a month today",
    outcomesDefault: 5,
    valueLabel: "What one signed project is worth to you",
    valueHint: "Your average project value, design fee and execution together if you do both.",
    valueDefault: 400000,
    spendDefault: 120000,
    wrongFitHint:
      "No possession yet and none for a year, a budget nowhere near your per-square-foot rate, a rented flat where nothing structural is allowed, a city you do not work in, or somebody who wants a free render to hand to a contractor. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "project",
    outcomeUnitPlural: "projects",
    caught: [
      {
        title: "No designer is assigned.",
        body: "Possession status, budget band, carpet area and timeline are asked before the opt-in. An enquiry that fails is routed to an exit page with something genuinely useful on it, so nobody books a studio visit, nobody drafts a layout, and no concept leaves the building unpaid.",
      },
      {
        title: "The enquiries you do design for are ready to build.",
        body: "You know the possession date, the budget band and the area before the first meeting, so the conversation is about the brief rather than about whether there is a project at all.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Possession status, budget band, carpet area and timeline are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No studio visit, no mood board, no layout.",
    score: "Everyone who passes is scored on what decides whether a project starts: possession, the budget band against the area they need done, how soon work can begin, and whether both decision-makers in the household are involved. They get a read on what their budget realistically covers at their size of home, which is the question they actually have.",
    signalOpener: "A gate stops your designers producing free concepts.",
    neverNoun: "the enquiries below your per-square-foot rate",
    goodShape: "an owner with possession, a budget and a date",
    badShape: "somebody collecting free renders",
    optimisesToward: "owners with possession, a budget and a date to start",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per signed project" },
  after: {
    brief:
      "The projects you want more of, your per-square-foot rate or your minimum project value, the cities you work, and the enquiry that always ends in a free concept.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a home-interiors enquiry rather than adapted from a generic style quiz.",
    notOurJob: "We do not run your ads and we design nothing.",
  },
  fit: {
    forList: [
      "Designers spend unpaid time on concepts that never convert",
      "You run Meta or Google ads, or are about to",
      "You have a minimum project value or a per-square-foot rate",
      "You can tell a ready buyer from an idea-collector when you hear one",
      "You would rather pitch five ready projects than twenty mood boards",
    ],
    notList: [
      "Your designers are idle and the practice is useful",
      "Your model is paid consultations where the concept IS the product",
      "You take any size of job and have no minimum",
      "All your work comes from builders and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "The free consultation is how this industry sells.",
      a: "It still is, and you still get to do it. The gate only decides who reaches it. The consultation goes ahead with the possession date, the budget band and the area already known, which is the version of that meeting where you win the job rather than audition for it.",
    },
    {
      q: "Clients genuinely do not know their budget.",
      a: "They do not know a number, which is why nobody should ask for one. A band framed against their carpet area is a question they can answer, and the result telling them what that band actually covers is the single most useful thing your website could say to them.",
    },
    {
      q: "Somebody without possession today is a client in eight months.",
      a: "Sometimes, and that is a nurture problem rather than a sales one. Route them to the exit page, let them have something useful, and keep them out of the pipeline your designers are working this month. A lead with no possession date sitting in the same list as one with keys is how the ready ones get missed.",
    },
    {
      q: "Our enquiries come from Instagram DMs, not a form.",
      a: "Then put the scorecard behind the link in your bio and in the ad, and the DM traffic runs through it. What this cannot govern is somebody who messages you directly, and if that is genuinely all of your enquiry flow then the arithmetic above is about a budget you are not spending.",
    },
    {
      q: "Will this not make my enquiry numbers look terrible?",
      a: "Yes, for a fortnight. Then cost per signed project is the number to read. Enquiry count in this business is mostly a measure of how many people liked a render, and you cannot pay your designers in that.",
    },
  ],
  finalCta: {
    heading: "Fewer concepts given away. More signed projects.",
    sub: "We write the gate for your rate, your cities and your minimum project, and take it live with you on one call.",
  },
});

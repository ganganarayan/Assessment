import { defineIndustry } from "./define";

/**
 * Recruitment and staffing firms.
 *
 * 🔴 The gate here faces EMPLOYERS, not candidates. That distinction is the
 * whole page: a recruiter's funnel has two sides, only one of them pays, and
 * screening candidates with a scorecard is a different product with employment
 * consequences we are not selling. Said plainly in the fit list and in an
 * objection.
 */
export const RECRUITERS = defineIndustry({
  key: "recruiters",
  shortName: "Recruiters",
  category: "Recruiters",
  keywordSlug: null,
  cardLine: "Live role, fee and sign-off, settled before a consultant starts sourcing.",
  meta: {
    title: "Lead qualification for recruitment firms",
    description:
      "Sourcing against a role nobody signed off is free work you paid to win. Assess360 settles the live role, the fee and the sign-off before the opt-in, scores everyone who passes, and reports only qualified employer enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody gets a shortlist until the role is real. And your ads learn to stop finding the ones that are not.",
    sub: "Whether the role is signed off, the fee they will pay, the seniority and the timeline are settled before the opt-in, so your consultants stop sourcing against vacancies that were never approved. Everyone who passes is scored, and only the qualified employer enquiries are reported back to Meta.",
  },
  gap: "the gap between the employer enquiry and the placement",
  businesses: "recruitment firms",
  rivals: "the agencies pitching against you",
  promiseWords:
    "an assessment, a hiring audit, a salary benchmark, a talent-market report, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never become a mandate",
  leak: {
    lead: "The work you give away in this business is sourcing: a consultant spends two days building a shortlist for a role that was never signed off, or for a client who will not pay your fee. Here is what buying those enquiries costs every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Employer enquiries a month",
    enquiriesDefault: 100,
    outcomesLabel: "Placements a month today",
    outcomesDefault: 5,
    valueLabel: "What one placement is worth to you",
    valueHint: "Your average fee on a placement you would actually want.",
    valueDefault: 250000,
    spendDefault: 90000,
    wrongFitHint:
      "No approved headcount, unwilling to pay anything near your fee, a function you do not recruit for, a single junior role not worth working, or somebody benchmarking salaries with no intention of hiring. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "placement",
    outcomeUnitPlural: "placements",
    caught: [
      {
        title: "No consultant starts sourcing.",
        body: "Whether the headcount is approved, the fee basis, the function and the timeline are asked before the opt-in. An employer who cannot answer them is routed to an exit page, so nobody builds a shortlist, nobody burns candidate goodwill on a role that will be pulled, and no CV goes out for free.",
      },
      {
        title: "The mandates you do work are real.",
        body: "The approval, the fee basis and the timeline arrive with the enquiry, so your consultant opens the conversation on the brief rather than discovering in week two that the role is on hold.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Approved headcount, fee basis, function and timeline are asked while the visitor is still anonymous, and an employer who fails never reaches the form. No shortlist, no candidate approached about a role that does not exist, no terms sent out speculatively.",
    score: "Everyone who passes is scored on what decides whether a mandate turns into a fee: whether the headcount is approved, how urgent the hire is, the fee basis, the seniority and whether the person enquiring owns the decision. They get a read on how hard their role will be to fill in this market, which is genuinely useful and the reason they complete it.",
    signalOpener: "A gate stops your consultants sourcing against roles nobody signed off.",
    neverNoun: "the employers with no approved role and no fee agreement",
    goodShape: "an employer with a signed-off role and a fee they will pay",
    badShape: "somebody benchmarking salaries",
    optimisesToward: "employers with live roles and a fee they will pay",
  },
  costPer: { before: "Cost per employer enquiry", after: "Cost per placement" },
  after: {
    brief:
      "The functions and seniorities you recruit for, your fee basis and floor, and the client enquiry your consultants most regret working.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for an employer enquiry rather than adapted from a candidate questionnaire.",
    notOurJob:
      "We do not run your ads, we do no sourcing, and we build nothing that screens or scores candidates.",
  },
  fit: {
    forList: [
      "You advertise to EMPLOYERS, not only to candidates",
      "Consultant sourcing time is given away on roles that get pulled",
      "You have a fee floor and a minimum seniority worth working",
      "You can tell an approved role from an aspiration when you ask",
      "You would rather work five real mandates than twenty maybes",
    ],
    notList: [
      "You want to screen or score CANDIDATES. This is not that and must not be",
      "Your model is volume contingency where working every role is the strategy",
      "Your consultants are on the bench and any brief is welcome",
      "All your clients are retained and existing, and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Can I use this to screen candidates instead?",
      a: "We will not build that, and it is worth being clear why. Scoring candidates with a marketing scorecard means making employment decisions on it, which carries fairness and discrimination consequences that neither of us should be casual about. This faces the paying side of your business: employers with roles and fees.",
    },
    {
      q: "Clients will not disclose a fee before we have spoken.",
      a: "Some will not. Ask the fee BASIS rather than a percentage, contingency or retained, and ask whether headcount is approved. Both are facts rather than negotiations, and an employer who will not say whether a role is approved has told you the most important thing about it.",
    },
    {
      q: "Working a speculative role is how we win the client.",
      a: "Occasionally, and expensively. If free sourcing is a deliberate business-development cost, keep it as a choice rather than as something your ads decide for you. The gate means you pick which speculative roles to work instead of taking whoever filled in the form.",
    },
    {
      q: "Our client enquiries come from outbound, not from ads.",
      a: "Then the Signal step buys you nothing and the gate buys you only what comes through your website. Enter just that share in the arithmetic above. For most firms it is small, and a small number is a reason not to buy.",
    },
    {
      q: "Fewer client enquiries looks like a step backwards.",
      a: "Cost per placement is the number that answers it, and it is the one reporting qualified employer completions to Meta is designed to move. Enquiry volume in recruitment is mostly a measure of how many people wanted a free salary benchmark.",
    },
  ],
  finalCta: {
    heading: "Fewer briefs. More placements.",
    sub: "We write the gate for your functions, your fee basis and your sign-off test, and take it live with you on one call.",
  },
});

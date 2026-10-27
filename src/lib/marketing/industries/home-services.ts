import { defineIndustry } from "./define";

/**
 * Home services. The only audience whose wasted lead has a fuel cost attached,
 * which is why the leak copy names the van and the half-day rather than an hour
 * of somebody's attention.
 */
export const HOME_SERVICES = defineIndustry({
  key: "home-services",
  shortName: "Home services",
  category: "Home services",
  keywordSlug: "lead-qualification-for-home-services",
  cardLine: "Service area, job type, budget and who owns the place, settled before a van moves.",
  meta: {
    title: "Lead qualification for home services businesses",
    description:
      "A site visit that cannot convert costs you diesel and half a technician's day. Assess360 settles service area, job type, budget and ownership before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "No van goes out to a job that was never going to close. And your ads learn to stop finding those jobs.",
    sub: "Service area, the job they actually want, the budget band and whether they are the person who can approve the work are settled before the opt-in, so a quote visit is never spent on a tenant collecting a third estimate. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the completed job",
  businesses: "home-services firms",
  rivals: "the firms quoting against you",
  promiseWords:
    "an assessment, a free quote, a home survey, a condition check, a grade or an analysis",
  gainNoun: "customers",
  neverVerb: "can never book a job",
  leak: {
    lead: "A wasted lead in this business is not an email, it is a van, a tank of diesel and half of somebody's day. Then the quote goes out and loses to a cheaper one from a firm that never had to drive there either. Here is what those enquiries cost in ad spend, and what the same budget buys once they stop.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 300,
    outcomesLabel: "Jobs completed a month today",
    outcomesDefault: 40,
    valueLabel: "What one completed job is worth to you",
    valueHint: "Your average invoice, across the mix of jobs you actually do.",
    valueDefault: 45000,
    spendDefault: 80000,
    wrongFitHint:
      "Outside your service area, a job you do not do, a budget nowhere near the work, a tenant who cannot authorise anything, or somebody collecting a third quote to beat down their existing contractor. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "job",
    outcomeUnitPlural: "jobs",
    caught: [
      {
        title: "The visit never gets booked.",
        body: "Pin code, job type, budget band and whether they own the property are asked before the opt-in. An enquiry that fails is routed to an exit page, so no slot is held, no van is dispatched, and nobody sits in traffic to quote a job that could never have been accepted.",
      },
      {
        title: "The visits you do make are half sold already.",
        body: "Your technician arrives knowing the job, the budget band and that the person at the door can say yes, which is the difference between a quote visit and a survey.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Service area, job type, budget band and whether they can authorise the work are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No booking, no reminder, no van.",
    score: "Everyone who passes is scored on what decides whether a job happens: urgency, the size of the work, the budget band, and whether the decision-maker is the one asking. They get a result that tells them roughly what their job involves and what to ask any contractor, which is why they complete it rather than bouncing to the next ad.",
    signalOpener: "A gate keeps your vans off quotes that were never going to close.",
    neverNoun: "the people outside your area and below your price",
    goodShape: "an owner in your service area with a job worth doing",
    badShape: "somebody collecting a third quote",
    optimisesToward: "owners in your area with jobs at your price",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per completed job" },
  after: {
    brief:
      "Your service area by pin code, the jobs you want more of, your minimum job value, and the visit you most regret sending a van on.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a home-services enquiry rather than adapted from a generic quiz.",
    notOurJob: "We do not run your ads and we do not quote or do any of the work.",
  },
  fit: {
    forList: [
      "A quote visit costs you a van and half a technician's day",
      "You run Meta or Google ads, or are about to",
      "You have a service area and people outside it still enquire",
      "You have a minimum job value you break more often than you would like",
      "You would rather make eight visits and win five than twenty and win five",
    ],
    notList: [
      "You quote remotely at no cost, so a wasted lead costs you almost nothing",
      "Your crews are idle and any job is welcome",
      "You win on being the cheapest quote and that is working",
      "You cover everywhere and do every kind of job",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "In this trade you win by getting there first, not by filtering.",
      a: "You win by getting to the RIGHT ones first, and a gate makes you faster at that, not slower. Ninety seconds of questions before the form, then the qualified job lands in your hand with the pin code, the job type and the budget band already attached, which is sooner than your office would have found any of it out.",
    },
    {
      q: "Nobody will fill in questions. They just want somebody to call them.",
      a: "Ask four, not fourteen, and make the result worth something: a rough idea of what their job involves and what to ask any contractor. The people who will not answer four questions about their own house were going to ring three other firms anyway, and one of those firms can have the diesel.",
    },
    {
      q: "Asking for a budget scares domestic customers.",
      a: "Asking for a number does. Asking which band the job is likely to sit in, after they have told you what the job is, reads as scoping. The ones who balk were price-shopping, and a price-shopper who refuses a band is the clearest signal you will get all week.",
    },
    {
      q: "We buy leads from aggregators. This does not help with those.",
      a: "Correct, and worth saying plainly. This governs YOUR funnel, your website and your ads. If every lead you get is bought by the piece from a portal, the gate has nothing to stand in front of. It becomes useful the day you start buying your own traffic.",
    },
    {
      q: "Will my lead count not collapse?",
      a: "It will drop, and cost per enquiry will rise. Cost per completed job is the number that falls, because the exclusion audience stops your ad reaching people outside your area and the qualified-only conversion event teaches Meta what a real customer looks like.",
    },
  ],
  finalCta: {
    heading: "Fewer visits. More jobs completed.",
    sub: "We write the gate for your service area, your job types and your minimum, and take it live with you on one call.",
  },
});

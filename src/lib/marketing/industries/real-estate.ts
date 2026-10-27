import { defineIndustry } from "./define";

/**
 * Real estate. The highest-volume funnel on this list and the one with the worst
 * ratio, which is why the arithmetic here is the whole argument and the defaults
 * are a pre-sales team calling several hundred enquiries for a handful of sales.
 */
export const REAL_ESTATE = defineIndustry({
  key: "real-estate",
  shortName: "Real estate",
  category: "Real estate",
  keywordSlug: "lead-qualification-for-real-estate",
  cardLine: "Budget, funding, timeline and location, settled before a site visit is offered.",
  meta: {
    title: "Lead qualification for real estate",
    description:
      "Three hundred enquiries and six sales is not a lead problem, it is a qualification problem. Assess360 settles budget, funding, timeline and location before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The enquiries that can never afford your inventory never become leads. And your ads learn to stop finding them.",
    sub: "Budget band, how the purchase is funded, the timeline and the location they actually want are settled before the opt-in, so your pre-sales team stops calling people who were browsing projects on a Sunday. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the registered sale",
  businesses: "developers and brokerages",
  rivals: "the projects advertising beside you",
  promiseWords:
    "an assessment, an eligibility check, a budget calculator, a home-loan check, a grade or an analysis",
  gainNoun: "buyers",
  neverVerb: "can never buy at your price",
  leak: {
    lead: "Nowhere on this list is the ratio worse. Hundreds of enquiries a month, a pre-sales team dialling all of them, and a handful of registrations at the end. Most of that budget bought people who can never afford your ticket size. Here is the figure, and here is what the same money buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 350,
    outcomesLabel: "Sales registered a month today",
    outcomesDefault: 6,
    valueLabel: "What one registered sale is worth to you",
    valueHint: "Your commission or margin on one unit, not the price of the unit.",
    valueDefault: 300000,
    spendDefault: 200000,
    wrongFitHint:
      "Budget far below your smallest unit, no chance of loan eligibility at that price, not buying for two years, wanting a different city or micro-market, a tenant looking to rent, or a broker fishing for inventory. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "sale",
    outcomeUnitPlural: "sales",
    caught: [
      {
        title: "The enquiry never reaches the pre-sales team.",
        body: "Budget band, funding route, timeline and micro-market are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page, so nobody dials it, nobody offers a site visit, and your CRM does not fill with records that will be marked not interested in six weeks.",
      },
      {
        title: "The site visits you do offer are to buyers who can buy.",
        body: "The budget band, the funding route and the timeline arrive with the enquiry, so the visit is a showing rather than a discovery call held in a show flat.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Budget band, funding route, timeline and the micro-market they want are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No lead, no call from pre-sales, no site visit to arrange and reschedule twice.",
    score: "Everyone who passes is scored on what decides a registration: budget against your actual inventory, how the purchase is funded, how soon they intend to buy, and whether the person enquiring is the one deciding. They get a result that names the configurations their budget really reaches, which is why they finish it rather than filling in four more project forms.",
    signalOpener: "A gate keeps your site visits for buyers who can actually buy.",
    neverNoun: "the enquiries that will never clear your ticket size",
    goodShape: "a buyer with the budget and the timeline for your inventory",
    badShape: "somebody browsing projects on a Sunday",
    optimisesToward: "buyers with the budget and the timeline for your inventory",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per registered sale" },
  after: {
    brief:
      "Your inventory and its price bands, the micro-markets you sell, and what your pre-sales team wastes most of its day on.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a property enquiry rather than adapted from a generic quiz.",
    notOurJob:
      "We do not run your ads, we do not sell your inventory and we make no assessment of anybody's loan eligibility.",
  },
  fit: {
    forList: [
      "You take 200 or more enquiries a month and close a handful",
      "A pre-sales team is paid to dial all of them",
      "You run Meta or Google ads at real volume",
      "You can name the smallest ticket size you actually sell",
      "You would rather offer thirty site visits to real buyers than three hundred calls",
    ],
    notList: [
      "Your pre-sales team is idle and the dialling is free",
      "You are selling out and any enquiry is welcome",
      "Your model is to sell the lead on rather than the unit",
      "You cannot name a budget below which an enquiry is pointless",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "In property, volume IS the strategy. One in fifty closes.",
      a: "One in fifty closes because you are buying fifty of the wrong people to find the one. Stop buying the forty that can never clear your ticket size and the same budget finds more of the one. That is the whole arithmetic above, in your numbers, and nothing about it requires you to believe us.",
    },
    {
      q: "Buyers will not state a budget. They want to see the project first.",
      a: "They will pick a band, especially when the result tells them which configurations that band actually reaches, which is the question they came with. What they will not do is type an exact figure, which is why the gate never asks for one.",
    },
    {
      q: "Is this checking home-loan eligibility?",
      a: "No. It asks how they intend to fund the purchase and takes their word for it. Eligibility is a lender's decision and nothing in the result may suggest otherwise, which is why the wording is drafted to stay on the buyer's own stated plan.",
    },
    {
      q: "Our channel partners and brokers send most of our leads.",
      a: "Then the gate governs only your own ads and website, and broker leads arrive as before. Run the arithmetic with just your direct spend. For most developers that is still the larger half, but check rather than take our word for it.",
    },
    {
      q: "Management measures the marketing team on lead count.",
      a: "Then this will make the marketing team look worse and the project look better, and somebody has to decide which of those matters. Cost per registered sale is the number this moves. If lead count is the number being reported upward, you will be punished for improving the other one, and we would rather say that here than after you have bought.",
    },
  ],
  finalCta: {
    heading: "Fewer enquiries. More registrations.",
    sub: "We write the gate for your ticket size, your micro-markets and your inventory, and take it live with you on one call.",
  },
});

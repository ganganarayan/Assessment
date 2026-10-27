import { defineIndustry } from "./define";

/**
 * Businesses selling through webinars.
 *
 * The only entry on this list that is a CHANNEL rather than a trade, which
 * changes the argument: the wasted money is not a wasted hour of anybody's time,
 * it is a registration count that everyone in the business has agreed to treat
 * as the goal. So this page argues with the metric.
 */
export const WEBINARS = defineIndustry({
  key: "webinars",
  shortName: "Webinars",
  category: "Webinars",
  keywordSlug: null,
  cardLine: "Role, budget and intent, settled before somebody takes a seat for free.",
  meta: {
    title: "Lead qualification for webinar funnels",
    description:
      "A thousand registrants who cannot buy is a cost, not a milestone. Assess360 settles role, budget and intent before the opt-in, scores everyone who passes, and reports only qualified registrations back to Meta.",
  },
  hero: {
    headline:
      "The registrants who could never buy never register. And your ads learn to stop finding them.",
    sub: "Their role, what they can spend and whether they can act on the offer at the end are settled before the opt-in, so you stop paying to fill a room with people who were never buying. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the registration and the sale",
  businesses: "webinar funnels",
  rivals: "the others running webinars in your category",
  promiseWords:
    "an assessment, a readiness check, a scorecard, a benchmark, a grade or an analysis before the session",
  gainNoun: "buyers",
  neverVerb: "can never buy what you present",
  leak: {
    lead: "Registration count is the most flattering number in this funnel and the least connected to revenue. You pay per registration, you pay again in reminders, and most of the room could never have bought the thing at the end. Here is what that costs every month.",
    enquiriesLabel: "Registrations a month",
    enquiriesDefault: 600,
    outcomesLabel: "Sales from the webinar a month today",
    outcomesDefault: 20,
    valueLabel: "What one sale from the webinar is worth to you",
    valueHint: "The price of the thing you actually sell at the end, after discounts.",
    valueDefault: 60000,
    spendDefault: 150000,
    wrongFitHint:
      "Nowhere near the price of the offer, the wrong role to act on it, in a country you cannot sell or deliver to, a competitor watching your pitch, or somebody who only ever attends free training. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "registration",
    outcomeUnit: "sale",
    outcomeUnitPlural: "sales",
    caught: [
      {
        title: "The seat never gets taken.",
        body: "Role, budget band and intent are asked before the opt-in. Somebody who cannot answer them is routed to an exit page with the useful part on it, so they are not registered, not reminded four times, and not counted in a show-up rate that everyone then tries to explain.",
      },
      {
        title: "The room you do present to can buy.",
        body: "Everyone in it has told you their role, their budget band and what they are trying to fix, so the pitch is to an audience rather than at one, and the questions in the chat come from people who could act on the answer.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Role, budget band and intent are asked while the visitor is still anonymous, and somebody who cannot act on your offer never registers. No seat, no reminder sequence, no replay email, and no place in a show-up statistic.",
    score: "Everyone who passes is scored on what predicts buying at the end: how acute the problem is, their role, the budget band and how soon they need it solved. They get a result worth having before the session even starts, which is a better reason to turn up than a reminder email and is why show-up rates usually rise rather than fall.",
    signalOpener: "A gate stops you paying to fill a room with people who cannot buy.",
    neverNoun: "the registrants who can never buy the offer",
    goodShape: "somebody who can act on the offer at the end",
    badShape: "somebody who collects free training",
    optimisesToward: "registrants who can act on the offer at the end",
  },
  costPer: { before: "Cost per registration", after: "Cost per sale from the webinar" },
  after: {
    brief:
      "What you sell at the end and for how much, who it is for, and the kind of registrant who never buys anything.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted so the result is worth attending for rather than just a hurdle before the room.",
    notOurJob: "We do not run your ads, we do not present your webinar and we write none of your pitch.",
  },
  fit: {
    forList: [
      "You buy registrations with paid traffic",
      "Your show-up rate and your close rate both embarrass you",
      "The thing you sell at the end has a real price",
      "You can name the role that can actually say yes to it",
      "You would rather present to eighty buyers than eight hundred attendees",
    ],
    notList: [
      "The webinar is brand-building and sells nothing",
      "You are paid by a sponsor per registration, so volume genuinely is the product",
      "Your offer is cheap enough that anybody in the room is a plausible buyer",
      "You fill the room organically and buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Registrations are the metric the whole funnel is built on.",
      a: "That is the problem rather than an objection to it. Registration count is an input you can buy more of at any time by asking less of people, which is precisely why it is uncorrelated with revenue. Put your real numbers into the arithmetic above and look at cost per sale instead. If your organisation cannot be persuaded to read that number, do not buy this.",
    },
    {
      q: "A gate in front of the registration will destroy my opt-in rate.",
      a: "It will reduce it, and it usually raises show-up rate, because somebody who answered eight questions and got a result back has invested something before the session. Fewer, warmer, more of whom turn up is the trade. The opt-in rate is the one metric here designed to be gamed by asking less.",
    },
    {
      q: "Attendees who cannot buy still create word of mouth.",
      a: "Sometimes, and the exit page is where that happens at no cost: give them the useful part, let them share it, and keep the seat, the reminders and the retargeting budget for buyers. Paying twice to have somebody in the room is an expensive way to be recommended.",
    },
    {
      q: "We use the registration list for everything afterwards.",
      a: "You will still have a list, made of people who told you their role and their budget band, which is a far better asset than a bigger one made of unknowns. The arithmetic above assumes none of that downstream value, so it understates the case rather than overstating it.",
    },
    {
      q: "Does this work for an automated or evergreen webinar?",
      a: "Better, because the cost is purely media and the gate sits in front of the same page every time. The scorecard replaces the registration form, the qualified go to the session, and the exclusion audience stops the ad reaching people who could never buy. Nothing in the mechanism needs the session to be live.",
    },
  ],
  finalCta: {
    heading: "A smaller room. More sales out of it.",
    sub: "We write the gate for your offer, your price and your buyer, and take it live with you on one call.",
  },
});

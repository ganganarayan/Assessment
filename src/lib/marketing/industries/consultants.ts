import { defineIndustry } from "./define";

/**
 * Independent and boutique consultants. The distinguishing leak here is not a
 * wasted hour, it is the diagnosis given away inside it, which is why the gate
 * copy talks about the scorecard doing the first consult rather than replacing it.
 */
export const CONSULTANTS = defineIndustry({
  key: "consultants",
  shortName: "Consultants",
  category: "Consultants",
  keywordSlug: "lead-qualification-for-consultants",
  featured: false,
  cardLine:
    "Mandate, budget and the decision already taken, settled before you give the diagnosis away.",
  meta: {
    title: "Lead qualification for consultants",
    description:
      "The expensive leak in consulting is not the wasted hour, it is the diagnosis you gave away inside it. Assess360 settles mandate, budget and timing before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody gets the diagnosis for free. And your ads learn to stop finding the people who ask for it.",
    sub: "Whether there is a mandate, whether there is a budget, and whether the decision has actually been taken are settled before the opt-in, so the exploratory call that ends in a thank-you email never gets booked. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the signed engagement",
  businesses: "consultancies",
  rivals: "the consultants bidding against you",
  promiseWords:
    "an assessment, a diagnostic, a maturity score, a readiness review, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never fund a project",
  leak: {
    lead: "Your inventory is thinking time, and you cannot make more of it. An enquiry with no mandate and no budget takes an hour of it, takes your framework away in their notes, and pays nothing. Here is what that costs in ad spend every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 70,
    outcomesLabel: "Engagements signed a month today",
    outcomesDefault: 3,
    valueLabel: "What one engagement is worth to you",
    valueHint: "The whole piece of work at your real fee, not a day rate.",
    valueDefault: 300000,
    spendDefault: 80000,
    wrongFitHint:
      "No budget line, no mandate from anyone senior, a problem outside your practice, a competitor doing research, or somebody who wants an hour of free thinking before going to procurement. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "engagement",
    outcomeUnitPlural: "engagements",
    caught: [
      {
        title: "The exploratory call never gets booked.",
        body: "Mandate, budget line and whether the decision has been taken are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page with something worth reading, so you spend no hour and hand over no framework to an organisation that was gathering views.",
      },
      {
        title: "The calls you do take start at the engagement.",
        body: "You know the mandate, the budget band and the timeline, so the hour goes on scoping the work rather than on finding out whether there is any. The proposal follows a conversation you were invited to have.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Mandate, budget line, timing and the decision already taken are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No call, no framework handed over, no follow-up to write.",
    score: "Everyone who passes is scored on what decides whether an engagement happens: how acute the problem is, whether somebody senior has mandated fixing it, whether a budget line exists, and when. They get a structured read on their own situation, which is a fair exchange for the answers and the reason they complete it.",
    signalOpener: "A gate protects the only thing you actually sell, which is your thinking.",
    neverNoun: "the enquiries that will never fund a project",
    goodShape: "an organisation with a mandate and a budget line",
    badShape: "somebody who wants an hour of free thinking",
    optimisesToward: "organisations that have already decided to fix this and funded it",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per signed engagement" },
  after: {
    brief:
      "Your practice area, the size of engagement you want, and the enquiry you most regret taking the call on.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a consulting enquiry rather than adapted from a generic quiz.",
    notOurJob: "We do not run your ads and we do not do your consulting.",
  },
  fit: {
    forList: [
      "Your own hours are the constraint on everything",
      "You advertise or publish to a contact form or a calendar link",
      "You can name the smallest engagement worth taking",
      "You have given away a diagnosis for free and watched it get implemented",
      "You would rather have three serious conversations than ten exploratory ones",
    ],
    notList: [
      "You are building a reputation and every conversation is worth having",
      "Your model is paid short diagnostics, where the call IS the product",
      "All your work comes by referral and you buy no traffic",
      "You cannot describe the mandate or budget that makes an enquiry real",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "The exploratory call is how I win work. I am not giving it up.",
      a: "You are not. This only decides who reaches it. The call stays exactly as it was, with the mandate, the budget band and the timeline established before you join, which usually means it starts where the good ones used to start forty minutes in.",
    },
    {
      q: "Serious clients will not fill in a scorecard.",
      a: "Serious clients will not fill in a form that asks for name, email and message. They will answer eight questions about their own situation and read a structured result about it, because that is a trade rather than a toll. The format is the reason it works where a contact form does not.",
    },
    {
      q: "Asking about budget before a conversation is not how this industry works.",
      a: "Asking for a number is not. Asking whether this has a budget line and roughly which band it sits in is how every procurement process you will ever enter starts, and the organisations that cannot answer it are the ones that were never going to raise a purchase order.",
    },
    {
      q: "My niche is tiny. The volume is not there for this.",
      a: "Then the gate matters more and the Signal step matters less. With low volume the wasted ad spend is small and the wasted hours are most of the loss, so run the numbers above with your real figures and buy on the hours or not at all. We would rather you did that than bought on a story.",
    },
    {
      q: "Does this not screen out people who could be educated into a budget?",
      a: "Some of them, yes, and that is the honest cost. It is why disqualification routes to a page worth reading with a way back, rather than to a dead end. The judgement you are making is whether educating a prospect into a budget is work you want to do unpaid at the volume your ads produce.",
    },
  ],
  finalCta: {
    heading: "Fewer exploratory calls. More signed engagements.",
    sub: "We write the gate for your practice, your fee and your mandate test, and take it live with you on one call.",
  },
});

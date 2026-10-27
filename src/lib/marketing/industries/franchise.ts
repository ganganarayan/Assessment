import { defineIndustry } from "./define";

/**
 * Franchisors recruiting franchisees. The one audience where the wrong-fit
 * applicant is not merely unprofitable but actively dangerous, because a
 * franchisee with no capital who signs anyway becomes a failed outlet with your
 * brand on it.
 */
export const FRANCHISE = defineIndustry({
  key: "franchise",
  shortName: "Franchise",
  category: "Franchise",
  keywordSlug: null,
  cardLine: "Capital, city and intent, settled before your franchise team takes a call.",
  meta: {
    title: "Lead qualification for franchisors",
    description:
      "An applicant with no capital is not a slow yes, it is a failed outlet with your brand on it. Assess360 settles capital, city and intent before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The applicants with no capital never reach your franchise team. And your ads learn to stop finding them.",
    sub: "Investable capital, the city they can open in, whether they intend to operate it themselves and when are settled before the opt-in, so your team stops running discovery calls with people looking for a job. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the franchise enquiry and the signed agreement",
  businesses: "franchisors",
  rivals: "the brands advertising beside you",
  promiseWords:
    "an assessment, an eligibility check, a franchise fit score, a readiness review, a grade or an analysis",
  gainNoun: "franchisees",
  neverVerb: "can never fund an outlet",
  leak: {
    lead: "A franchise funnel is the longest sales cycle on this list and the easiest to flood. Most applicants have nothing like the capital, and each one still takes a discovery call, a deck and three follow-ups. Here is what that costs in ad spend every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Franchise enquiries a month",
    enquiriesDefault: 200,
    outcomesLabel: "Franchisees signed a month today",
    outcomesDefault: 2,
    valueLabel: "What one signed franchisee is worth to you",
    valueHint: "Franchise fee plus your first-year royalty from one outlet.",
    valueDefault: 500000,
    spendDefault: 150000,
    wrongFitHint:
      "Capital nowhere near your investment range, no access to a site in a city you want, looking for employment rather than ownership, unwilling to operate it, or three years away from doing anything. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "signed franchisee",
    outcomeUnitPlural: "signed franchisees",
    caught: [
      {
        title: "The discovery call never gets booked.",
        body: "Capital band, city, operating intent and timeline are asked before the opt-in. An applicant who cannot answer them is routed to an exit page that is honest about the investment required, so your team runs no call, sends no deck, and nobody is strung along for a month before being told the number.",
      },
      {
        title: "The applicants you do speak to can actually fund it.",
        body: "The capital band, the city and whether they will run it themselves arrive with the application, so the first call is about the territory and the model rather than about whether this is affordable.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Capital band, target city, operating intent and timeline are asked while the visitor is still anonymous, and an applicant who fails never reaches the form. No discovery call, no franchise deck, no territory conversation.",
    score: "Everyone who passes is scored on what predicts a franchisee who succeeds rather than merely signs: capital against your real investment range, whether the city is one you want next, relevant operating experience, and whether they intend to run it themselves. They get a read on their own readiness to own a business, which is why they complete it.",
    signalOpener: "A gate keeps your franchise team off calls with people who have no capital.",
    neverNoun: "the applicants with no capital and no city",
    goodShape: "somebody with the capital and a city you want next",
    badShape: "somebody looking for a job",
    optimisesToward: "people with the capital and the city you want next",
  },
  costPer: { before: "Cost per application", after: "Cost per signed franchisee" },
  after: {
    brief:
      "Your investment range, the cities you want next, what a good franchisee looks like, and the applicant your team is tired of talking to.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a franchise application rather than adapted from a generic quiz.",
    notOurJob:
      "We do not run your ads, we do not recruit for you and we make no judgement about anybody's finances beyond what they tell you.",
  },
  fit: {
    forList: [
      "Your investment range rules most applicants out and they apply anyway",
      "A franchise development team is paid to call all of them",
      "You run Meta or Google ads for franchise recruitment",
      "You have cities you actively want and cities you do not",
      "A failed outlet costs you more than a missed application",
    ],
    notList: [
      "You are opening anywhere with anyone who can pay the fee",
      "Your development team is idle and the calls are free",
      "You have no minimum investment and no territory plan",
      "All your franchisees come from existing customers and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "We would rather talk to everyone. You never know who has money.",
      a: "You do know, if you ask. A capital band is one question and the people with the money answer it readily, because they have had this conversation with a bank. The ones who will not answer are not hiding wealth, and two hundred discovery calls a month to find two signings is the cost of believing otherwise.",
    },
    {
      q: "Stating the investment up front scares applicants off.",
      a: "It scares off applicants who cannot make the investment, which is the entire point, and it is kinder than discovering it in week four. Brands that hide the number get volume and a development team that spends its life delivering bad news.",
    },
    {
      q: "Our applicants expect a human conversation, not a form.",
      a: "They get one, sooner and better. The scorecard gives them a structured read on their own readiness before they speak to anyone, and your team arrives at the call knowing the capital band and the city. That is a better human conversation than the one that opens with four screening questions.",
    },
    {
      q: "A low-capital applicant could raise the money.",
      a: "Some do, and the exit page is written for them: honest about the range, with a way back when they are ready. What it does not do is put them into the same pipeline as a funded applicant, where they absorb the same follow-up for a fraction of the chance.",
    },
    {
      q: "Will application volume not fall off a cliff?",
      a: "It will fall a long way, because most of it was never real. Cost per signed franchisee is the number to watch, and reporting only qualified completions to Meta is what makes the ad account start finding people with capital rather than people who click on business opportunities.",
    },
  ],
  finalCta: {
    heading: "Fewer applications. More outlets that open.",
    sub: "We write the gate for your investment range, your cities and your ideal franchisee, and take it live with you on one call.",
  },
});

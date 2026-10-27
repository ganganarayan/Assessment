import { defineIndustry } from "./define";

/**
 * Financial advisers.
 *
 * 🔴 The one page on this list where the reader has a compliance function, so the
 * copy never tells them what they are allowed to ask. It says bands are usually
 * easier to clear than exact figures and sends them to their own compliance
 * team, because a marketing page confidently describing somebody else's
 * regulatory position is how you get a customer in trouble.
 */
export const FINANCIAL_ADVISERS = defineIndustry({
  key: "financial-advisers",
  shortName: "Financial advisers",
  category: "Financial advisers",
  keywordSlug: "lead-qualification-for-financial-advisors",
  cardLine: "Assets, timeline and the decision, settled before a first meeting is offered.",
  meta: {
    title: "Lead qualification for financial advisers",
    description:
      "A first meeting with somebody who has nothing to invest costs the same as one with somebody who has. Assess360 settles assets, timeline and intent before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The enquiries with nothing to place never reach your diary. And your ads learn to stop finding them.",
    sub: "What they have to invest, when they intend to act and whether a decision has actually been made are settled before the opt-in, so the meeting you would end at minute ten never gets booked. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the funded account",
  businesses: "advisory firms",
  rivals: "the other advisers in your city",
  promiseWords:
    "an assessment, a portfolio review, a risk profile, a retirement readiness score, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never fund an account",
  leak: {
    lead: "Your constraint is meetings, and a meeting is an hour whether the person across the table has a portfolio to move or a question about their cousin's policy. Here is what the second kind costs you in ad spend every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 120,
    outcomesLabel: "New funded clients a month today",
    outcomesDefault: 6,
    valueLabel: "What one new funded client is worth to you",
    valueHint: "Your first-year revenue from them, fee or commission, however you are paid.",
    valueDefault: 150000,
    spendDefault: 120000,
    wrongFitHint:
      "Nothing to place, not acting for a year or more, wanting a free second opinion on somebody else's plan, outside the products you advise on, or outside where you are authorised to operate. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "funded client",
    outcomeUnitPlural: "funded clients",
    caught: [
      {
        title: "The meeting never gets offered.",
        body: "Investable band, timeline and whether a decision has been made are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page with something genuinely useful on it, so no appointment is held, no file is opened and nobody is chased for a review they never wanted.",
      },
      {
        title: "The meetings you do take start at advice.",
        body: "You arrive knowing the band, the timeline and the goal, so the first meeting is advice rather than fact-finding, which is both a better meeting and a shorter one.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. The investable band, the timeline, the goal and whether a decision has been taken are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No appointment, no file, no follow-up sequence.",
    score: "Everyone who passes is scored on what decides whether advice turns into a client: what there is to place, how soon, how complex the situation is, and whether the person in front of you is the one deciding. They get a structured read on their own position, which is why they finish it rather than abandoning it.",
    signalOpener: "A gate keeps your diary for people with something to place.",
    neverNoun: "the enquiries that will never clear your minimum",
    goodShape: "somebody with assets to place and a decision to make",
    badShape: "somebody who wants a free second opinion",
    optimisesToward: "people with assets to place and a reason to move them",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per funded client" },
  after: {
    brief:
      "What you advise on, the smallest client worth onboarding, and the enquiry you most regret giving an hour to.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for an advice enquiry rather than adapted from a generic quiz.",
    notOurJob:
      "We do not run your ads, we give no financial advice, and nothing we write is a suitability assessment.",
  },
  fit: {
    forList: [
      "Meetings are your constraint and your diary is full of the wrong ones",
      "You run ads or paid promotion to a form or a calendar link",
      "You can name the smallest client worth onboarding",
      "Your compliance team is reachable and will look at wording",
      "You would rather hold six real first meetings than twenty courtesy ones",
    ],
    notList: [
      "You are building a book and every conversation is worth having",
      "You cannot get marketing copy approved in any reasonable timeframe",
      "All your business is referral and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
      "You need the tool to make a suitability judgement. It does not and must not",
    ],
  },
  objections: [
    {
      q: "Am I even allowed to ask about assets before a client relationship exists?",
      a: "That is a question for your compliance function rather than for us, and we will not pretend otherwise. What we can say is what works in practice: a band rather than a figure, framed as which service is appropriate rather than as what you are worth, asked after they have described their goal. Bands are usually easier to get approved than exact numbers. Send us the wording your compliance team will accept and we will build the gate around it.",
    },
    {
      q: "Is this scoring a client's suitability for a product?",
      a: "No, and it must not be read that way. It scores whether an ENQUIRY is worth a meeting, on commercial facts like the band, the timeline and who is deciding. Suitability is advice, it is your job, it happens after this, and nothing in the result should look like a recommendation. We write the wording with that line in mind and your compliance team sees it before it goes live.",
    },
    {
      q: "Trust is everything in this business. A form like this feels cold.",
      a: "Colder than a contact form that asks for a phone number and tells them nothing? The scorecard gives them a structured read on their own situation before they have spoken to anyone, which is the warmest thing on most advisers' websites. The people who find it cold were not going to book.",
    },
    {
      q: "My problem is not lead quality, it is that nobody books the meeting.",
      a: "Then look at where they stop. If enquiries arrive and go cold, the issue is the offer and the follow-up, and this will not fix it. If your diary fills with meetings that go nowhere, this is exactly the problem it is for. Run the arithmetic above with your real numbers and let the wrong-fit percentage decide which one you have.",
    },
    {
      q: "Will my cost per lead rise?",
      a: "Yes, because the cheap enquiries stop being counted. Cost per funded client is the number to watch, and reporting only qualified completions to Meta is what makes the ad account chase that instead of form-fills.",
    },
  ],
  finalCta: {
    heading: "Fewer first meetings. More funded clients.",
    sub: "We write the gate for your service, your minimum and your compliance wording, and take it live with you on one call.",
  },
});

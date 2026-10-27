import { defineIndustry } from "./define";

/**
 * Course creators. The only audience whose funnel is DESIGNED to collect people
 * who will not buy, which is why this page argues with the lead magnet rather
 * than with the sales page.
 */
export const COURSE_CREATORS = defineIndustry({
  key: "course-creators",
  shortName: "Course creators",
  category: "Course creators",
  keywordSlug: "lead-qualification-for-course-creators",
  cardLine: "Level, budget and intent, settled before somebody joins a launch list for free.",
  meta: {
    title: "Lead qualification for course creators",
    description:
      "A list built on free downloads converts like a list built on free downloads. Assess360 settles level, budget and intent before the opt-in, scores everyone who passes, and teaches your ad account to stop finding people who only ever take the free thing.",
  },
  hero: {
    headline:
      "The people who only ever take the free thing never join the list. And your ads learn to stop finding them.",
    sub: "Current level, what they can spend on learning and whether they intend to buy anything are settled before the opt-in, so your launch list stops filling up with people who were always going to open and never buy. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the free download and the paid enrolment",
  businesses: "course businesses",
  rivals: "the other creators in your niche",
  promiseWords: "an assessment, a skills check, a level test, a readiness score, a grade or an analysis",
  gainNoun: "students",
  neverVerb: "can never pay for the course",
  leak: {
    lead: "Every launch runs the same arithmetic: a big list, a tiny conversion rate, and a conclusion that the copy needs work. Usually the copy is fine and the list is wrong. Here is what the wrong half of it cost to acquire, and what the same budget buys once you stop buying it.",
    enquiriesLabel: "New leads a month",
    enquiriesDefault: 250,
    outcomesLabel: "Paid enrolments a month today",
    outcomesDefault: 15,
    valueLabel: "What one paid enrolment is worth to you",
    valueHint: "Your real course price, after discounts and before refunds.",
    valueDefault: 60000,
    spendDefault: 150000,
    wrongFitHint:
      "Nowhere near your price, far below or far above the level you teach, only ever downloading the free resource, in a country you cannot take payment from, or another creator having a look at your funnel. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "lead",
    outcomeUnit: "enrolment",
    outcomeUnitPlural: "enrolments",
    caught: [
      {
        title: "They never join the list.",
        body: "Level, budget band and intent are asked before the opt-in. Somebody who cannot answer them is routed to an exit page with the free resource still on it, so they get what they came for and your list, your email costs and your open rates stay about people who might buy.",
      },
      {
        title: "The launch sells to a list that can buy.",
        body: "Everyone on it has told you their level, their budget band and when they want to start, which is the difference between writing a launch sequence and writing it to somebody.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Level, budget band and intent are asked while the visitor is still anonymous, and somebody who cannot answer them never joins the list. They can still have the free thing: the exit page is where it lives.",
    score: "Everyone who passes is scored on what predicts finishing and paying: where they actually are now, what they have already tried, how urgently they need the outcome, and what they can spend. They get a result that tells them which level to start at, which is more useful than a PDF and the reason they complete it.",
    signalOpener: "A gate keeps your list made of people who could buy.",
    neverNoun: "the people who only ever take the free resource",
    goodShape: "somebody at the right level with money to spend on skills",
    badShape: "somebody who collects free downloads",
    optimisesToward: "people at the right level who actually buy courses",
  },
  costPer: { before: "Cost per lead", after: "Cost per paid enrolment" },
  after: {
    brief:
      "What you teach and to whom, the price, and the kind of subscriber who has never once bought anything.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted as a level diagnostic for your subject rather than adapted from a generic quiz.",
    notOurJob: "We do not run your ads, we do not write your launch and we do not teach your course.",
  },
  fit: {
    forList: [
      "You run paid traffic to a lead magnet or a webinar",
      "Your list is large and your conversion rate is embarrassing",
      "Your course has a real price, not an impulse price",
      "You can name the level somebody has to be at for this to work",
      "You would rather email 2,000 people who might buy than 20,000 who will not",
    ],
    notList: [
      "You are still validating and need volume to learn from",
      "Your product is cheap enough that everyone is a plausible buyer",
      "Your whole model is a huge free list monetised by sponsorship",
      "You have no paid traffic, so there is no wasted spend to reclaim",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "A big list is the asset. Why would I shrink it?",
      a: "It is an asset if it buys things. A list of 40,000 people who came for a free template costs real money every month in sending, suppresses your deliverability, and flatters every metric except revenue. The question is not list size, it is what each new subscriber cost and whether that one could ever pay you.",
    },
    {
      q: "Gating the lead magnet defeats the point of a lead magnet.",
      a: "Nobody is gating the resource. The disqualified still get it, on the exit page, without entering your funnel. What is gated is the list, the retargeting audience and the launch sequence, which are the expensive parts.",
    },
    {
      q: "My opt-in rate is the number my whole funnel is built on.",
      a: "It is, and it is the number that improves every time you ask less of people who will never buy. Opt-in rate will fall. Revenue per thousand leads and cost per paid enrolment are the two that move the other way, and they are the two your launch is actually judged on.",
    },
    {
      q: "I sell at several price points. One gate cannot cover that.",
      a: "It does not have to be one answer. The gate disqualifies only people who can buy nothing at all, and the score routes everybody else: the result can point at the self-paced course for one band and the cohort for another. That is the normal setup, not a special case.",
    },
    {
      q: "Will this not stop beginners who would have grown into customers?",
      a: "Some of them, and that is the honest cost. It is why the gate asks for a level and a budget band rather than demanding proof of either, and why the exit page keeps a way back in. If nurturing beginners for a year is genuinely your model, this is the wrong trade and the arithmetic above will say so when you enter your real numbers.",
    },
  ],
  finalCta: {
    heading: "A smaller list. More paid enrolments from it.",
    sub: "We write the gate for your subject, your level and your price, and take it live with you on one call.",
  },
});

import { defineIndustry } from "./define";

/**
 * B2B SaaS. The one audience on this list that already believes in scoring and
 * still has the problem, which is why the objections lean on MQL and PQL models
 * rather than on whether qualification is worth doing at all.
 */
export const B2B_SAAS = defineIndustry({
  key: "b2b-saas",
  shortName: "B2B SaaS",
  category: "B2B SaaS",
  keywordSlug: "lead-qualification-for-saas",
  featured: true,
  cardLine:
    "Team size, stack, budget and authority, settled before the demo lands in an AE's calendar.",
  meta: {
    title: "Lead qualification for B2B SaaS",
    description:
      "Your demo form converts everyone, which is the problem. Assess360 settles company size, stack, budget and authority before the opt-in, scores everyone who passes, and reports only qualified demos back to Meta so the ad account stops buying browsers.",
  },
  hero: {
    headline:
      "The demos that were never going to close never get booked. And your ads learn to stop finding them.",
    sub: "Company size, current stack, budget and whether this person can actually sign are settled before the opt-in, so the demo your AE would disqualify in the first four minutes never reaches the calendar. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the demo request and the signed deal",
  businesses: "SaaS companies",
  rivals: "the other tools in your category",
  promiseWords:
    "an assessment, a readiness check, a maturity score, a benchmark, a grade or an analysis",
  gainNoun: "customers",
  neverVerb: "can never buy",
  leak: {
    lead: "A student researching a term paper and a VP with a budget cost you the same per click, and your demo form treats them identically. Here is what the first group costs you every month, and what the same budget buys once you stop paying for them.",
    enquiriesLabel: "Demo requests a month",
    enquiriesDefault: 120,
    outcomesLabel: "New customers a month today",
    outcomesDefault: 8,
    valueLabel: "What one new customer is worth to you",
    valueHint: "First-year contract value, not monthly, and not lifetime.",
    valueDefault: 180000,
    spendDefault: 250000,
    wrongFitHint:
      "Too small to need you, no budget this year, a region you do not sell into, a stack you do not integrate with, a competitor having a look, or somebody who cannot sign and will not name who can. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "demo request",
    outcomeUnit: "new customer",
    outcomeUnitPlural: "new customers",
    caught: [
      {
        title: "The demo never reaches the calendar.",
        body: "Headcount, current tooling, budget window and authority are asked before the opt-in. An account that cannot answer them is routed to an exit page with something useful on it, so no lead is created, no AE holds a slot, and nobody has to write the polite no-fit email.",
      },
      {
        title: "The demos you do take open at the product.",
        body: "Your AE walks in knowing the team size, what they are replacing, the budget window and who signs, so the first four minutes go on the problem instead of on discovery questions the form should have asked.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Headcount, current stack, budget window and buying authority are asked while the visitor is still anonymous, and an account that fails never reaches the form. No lead in the CRM, no routing rule to write, no AE wondering why this one was assigned to them.",
    score: "Everyone who passes is scored on what actually predicts a close in your motion: company size, the tool they are replacing, how urgent the problem is, the budget window and whether the person in front of you can sign. They get a result worth reading, which is why they finish it instead of bouncing at question four.",
    signalOpener: "A gate saves your AEs' calendar.",
    neverNoun: "the accounts that will never qualify",
    goodShape: "an account with budget, authority and a problem you solve",
    badShape: "somebody who books demos to look at software",
    optimisesToward: "accounts with the headcount, the stack and the budget to buy",
  },
  costPer: { before: "Cost per demo request", after: "Cost per closed deal" },
  after: {
    brief:
      "Your ICP in one paragraph, the deal sizes you want more of, and the three answers that make your AEs groan when they open a lead.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a B2B evaluation rather than adapted from a consumer quiz.",
    notOurJob:
      "We do not run your ads, we do not sit in your pipeline reviews and we do not touch your CRM beyond the webhook you point at it.",
  },
  fit: {
    forList: [
      "You take 50 or more demo requests a month",
      "AE time is your real constraint, not top-of-funnel volume",
      "You can describe your ICP without using the word everyone",
      "You run Meta or Google ads, or are about to",
      "You would rather report fewer, better demos to the board than a bigger MQL number",
    ],
    notList: [
      "You are pre-product-market-fit and still learning who buys",
      "Your AEs have empty calendars and any demo is welcome",
      "Your board is measured on MQL volume and that is not negotiable",
      "Your deal is self-serve and nobody ever gets on a call",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "We already score leads. We have an MQL model.",
      a: "Your model scores leads that already exist, after the form, using whatever the form collected plus enrichment. This decides which requests become leads at all, before the opt-in, using answers the visitor gives you on purpose. The two are not the same layer, and the one you are missing is the cheaper one.",
    },
    {
      q: "Gating the demo will tank our conversion rate.",
      a: "It will tank your form conversion rate, which is a metric that improves every time you make the form easier for people who will never buy. Demo-to-opportunity and opportunity-to-close are the rates that move the other way. Pick which of the three your board should be reading.",
    },
    {
      q: "Qualifying is literally what our SDRs are for.",
      a: "It is, and an SDR hour spent establishing that a twelve-person company has no budget is the most expensive way your business could possibly have learned that. The gate asks it for free, at 2am, consistently, before the lead is routed to anyone.",
    },
    {
      q: "Enrichment already tells us headcount and tech stack.",
      a: "For some of them, from a work email, after the fact. Enrichment cannot tell you the budget window, the urgency, or whether this particular person can sign, and those are the three that decide whether the demo was worth holding. Ask the buyer instead of guessing at their domain.",
    },
    {
      q: "Our pipeline target is volume. Fewer leads is the wrong direction.",
      a: "Then this is the wrong product for this quarter, and that is a fair answer. The arithmetic above still holds: the same ad budget buys more closed deals when it stops buying accounts that cannot buy. If the number being reported upward is MQLs, you will be punished for improving it.",
    },
  ],
  finalCta: {
    heading: "Fewer demos. More closed deals from the same ad budget.",
    sub: "We write the gate for your ICP, your deal size and your motion, and take it live with you on one call.",
  },
});

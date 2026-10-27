import { defineIndustry } from "./define";

/**
 * IT services and development firms. The leak that lands here is pre-sales
 * engineering: a solution architect scoping and estimating work for an enquiry
 * that was never funded, which is the most expensive free sample in software.
 */
export const IT_SERVICES = defineIndustry({
  key: "it-services",
  shortName: "IT services",
  category: "IT services",
  keywordSlug: "lead-qualification-for-it-services",
  cardLine: "Budget, stack and authority, settled before an architect writes an estimate.",
  meta: {
    title: "Lead qualification for IT services firms",
    description:
      "Pre-sales engineering for projects nobody funded is the most expensive free sample in software. Assess360 settles budget, stack and authority before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody gets a free estimate unless the project is funded. And your ads learn to stop finding the rest.",
    sub: "Budget band, the stack, the timeline and whether anyone has signed this off are settled before the opt-in, so your architects stop scoping projects that were never going to happen. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the signed statement of work",
  businesses: "IT firms",
  rivals: "the firms bidding against you",
  promiseWords:
    "an assessment, a technical audit, a maturity score, a readiness review, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never fund a project",
  leak: {
    lead: "An enquiry that cannot fund a project still consumes a discovery call, an architect's afternoon and an estimate. That is senior engineering time spent producing a document for somebody comparing you against a freelancer. Here is what buying those enquiries costs, every month.",
    enquiriesLabel: "Project enquiries a month",
    enquiriesDefault: 80,
    outcomesLabel: "Projects signed a month today",
    outcomesDefault: 4,
    valueLabel: "What one signed project is worth to you",
    valueHint: "Your average contract value for the work you want more of.",
    valueDefault: 500000,
    spendDefault: 100000,
    wrongFitHint:
      "Budget nowhere near your smallest project, price-checking against a freelance rate, a stack you do not work in, no sign-off from anyone senior, or a student or competitor asking for an architecture. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "project",
    outcomeUnitPlural: "projects",
    caught: [
      {
        title: "The architect never gets pulled in.",
        body: "Budget band, stack, timeline and sign-off are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page, so nobody books discovery, nobody writes an estimate, and no senior engineer loses an afternoon to a project with no budget line.",
      },
      {
        title: "The enquiries you do scope are real projects.",
        body: "The budget band, the stack and the sign-off arrive with the enquiry, so discovery is about the architecture rather than about whether this is going to happen at all.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Budget band, current stack, timeline and whether the project has been signed off internally are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No discovery call, no estimate, no architecture handed to somebody who will shop it around.",
    score: "Everyone who passes is scored on what decides whether a project happens: budget against your smallest viable engagement, the stack against what you are genuinely good at, urgency, and whether somebody senior has already approved the spend. They get a structured read on their own readiness to build, which is why they finish it.",
    signalOpener: "A gate stops your architects scoping work nobody funded.",
    neverNoun: "the enquiries that will never fund a project",
    goodShape: "a company with a budget and a system worth building",
    badShape: "somebody price-checking against a freelancer",
    optimisesToward: "companies with the budget and the stack you build on",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per signed project" },
  after: {
    brief:
      "The work you want more of, your smallest viable project, the stacks you work in, and the enquiry that always wastes an architect's day.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a technical buying process rather than adapted from a consumer quiz.",
    notOurJob: "We do not run your ads, we do not bid for your projects and we write none of your code.",
  },
  fit: {
    forList: [
      "Pre-sales engineering time is a real cost you can feel",
      "You run ads or outbound to a contact form",
      "You can name your smallest viable project",
      "You lose bids to freelancers on price and would rather not meet them",
      "You would rather write four estimates and win two than twelve and win two",
    ],
    notList: [
      "You are a staffing shop where volume of enquiries genuinely is the model",
      "You compete on rate card and that is working",
      "Your pipeline is entirely partner-led and you buy no traffic",
      "Your bench is empty and any project is welcome",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "We could build this in a sprint.",
      a: "You could build the gate in a sprint. The part that is tedious rather than hard is the ad-account half: an exclusion event on every disqualification and a qualified-only conversion event through the Conversions API, per funnel, maintained while your team ships client work. Most firms who say this are right and never do it, because it is nobody's billable hour.",
    },
    {
      q: "Buyers will not disclose budget on a web form.",
      a: "Some will not. Ask it as a band, after they have described the system, and frame it as which engagement model fits rather than as what they have got. In enterprise the answer is often a shrug, which is itself the signal: a project with no budget band has not been approved, and that is exactly what you wanted to know before booking discovery.",
    },
    {
      q: "Our deals come through partners and referrals.",
      a: "Then the Signal step buys you nothing, because there is no ad spend to reclaim, and the gate buys you only the pre-sales hours. That is a smaller number. Put your real figures into the arithmetic above and decide on that, not on this page.",
    },
    {
      q: "A technical buyer will find a scorecard patronising.",
      a: "A badly written one, yes. A readiness diagnostic that asks about their stack, their data volumes and their timeline, and hands back a structured read with the gaps named, is the kind of thing technical buyers actually finish. The wording is drafted with you for that reason.",
    },
    {
      q: "What happens to enquiry volume?",
      a: "It falls, deliberately, and cost per enquiry rises. Cost per signed project is the number that matters and the one that moves, because reporting only qualified completions to Meta is what stops the account buying people comparing you to a freelancer.",
    },
  ],
  finalCta: {
    heading: "Fewer estimates. More signed projects.",
    sub: "We write the gate for your stack, your smallest project and your sign-off test, and take it live with you on one call.",
  },
});

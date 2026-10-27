import { defineIndustry } from "./define";

/**
 * Agencies. The audience that already understands the Signal step better than we
 * do, because they run the ad accounts, which is why this page is blunter about
 * cost per lead rising than any other page on the site.
 */
export const AGENCIES = defineIndustry({
  key: "agencies",
  shortName: "Agencies",
  category: "Agencies",
  keywordSlug: "lead-qualification-for-agencies",
  featured: true,
  cardLine:
    "Budget, scope and authority, settled before a senior person writes a proposal for free.",
  meta: {
    title: "Lead qualification for agencies",
    description:
      "Writing proposals for prospects who cannot clear your minimum is unpaid work you bought with ad spend. Assess360 settles budget, scope and authority before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody below your minimum gets a proposal. And your ads learn to stop finding them.",
    sub: "Monthly budget, the scope they actually want and whether this person can sign are settled before the opt-in, so the enquiry that ends in a free strategy deck never reaches your senior people. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the signed retainer",
  businesses: "agencies",
  rivals: "the agencies pitching against you",
  promiseWords:
    "an audit, an assessment, a growth score, a funnel teardown, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never clear your minimum",
  leak: {
    lead: "You know this arithmetic better than we do, which is the awkward part: you run it for clients and not for yourself. A prospect who can never clear your minimum costs the same per click as one who can, and then costs a second time in the proposal. Here is both, every month.",
    enquiriesLabel: "New business enquiries a month",
    enquiriesDefault: 90,
    outcomesLabel: "New retainers signed a month today",
    outcomesDefault: 4,
    valueLabel: "What one new retainer is worth to you",
    valueHint: "The first twelve months of it, at your real rate, not a single invoice.",
    valueDefault: 600000,
    spendDefault: 120000,
    wrongFitHint:
      "Below your minimum, wanting a one-off piece when you sell retainers, asking for a service you do not offer, a founder with no funding, or a marketing manager whose budget was never approved. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "retainer",
    outcomeUnitPlural: "retainers",
    caught: [
      {
        title: "The enquiry never reaches a senior person.",
        body: "Monthly budget band, the scope they want and who signs are asked before the opt-in. A prospect who cannot answer them is routed to an exit page, so nobody books a chemistry call, nobody builds a deck, and no strategist loses an afternoon to an account that was always going to go to the cheapest bidder.",
      },
      {
        title: "The pitches you do take are briefed before you start.",
        body: "You open the call knowing the budget band, the scope and the decision-maker, which is most of what a first meeting usually goes on, and the proposal you write is one you were asked for rather than one you volunteered.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Budget band, scope, timeline and authority are asked while the visitor is still anonymous, and a prospect who fails never reaches the form or the calendar. No lead, no chemistry call, no deck.",
    score: "Everyone who passes is scored on what decides whether an account is worth winning: budget against your minimum, scope against what you are actually good at, how urgent it is, and whether the person in front of you can sign. They get a result that reads like the first page of an audit, which is why they finish it.",
    signalOpener: "A gate stops your senior people pitching for free.",
    neverNoun: "the prospects who will never clear your minimum",
    goodShape: "a company with a budget and a problem you are good at",
    badShape: "somebody collecting three quotes",
    optimisesToward: "companies that can clear your minimum and want the work you do best",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per signed retainer" },
  after: {
    brief:
      "Your monthly minimum, the services you want more of, and the kind of enquiry your strategists dread opening.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for an agency new-business enquiry rather than adapted from a generic template.",
    notOurJob:
      "We do not run your ads, we do not take your pitches and we do not compete with you for the work.",
  },
  fit: {
    forList: [
      "You have a monthly minimum and you break it more often than you admit",
      "Senior time goes on proposals that were never going to be read",
      "You run ads, or your own funnel, to a contact form",
      "You can name the budget below which you would rather not meet",
      "You would rather pitch four times and win two than pitch twelve and win two",
    ],
    notList: [
      "You are hungry for any work at any size right now",
      "Your model is one-off projects where volume genuinely is the point",
      "You win on price and would rather keep doing that",
      "Your pipeline is entirely referral and you do not advertise",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "We build this sort of thing for clients. Why buy it?",
      a: "Most of you could, and most of you have not, because it is nobody's billable hour. The part that is genuinely hard to hand-roll is the ad-account half: an exclusion event on every disqualification and a qualified-only conversion event wired through the Conversions API, per funnel, maintained. If you want to build it anyway, the arithmetic above is the useful part of this page.",
    },
    {
      q: "A form that asks for budget will scare off good prospects.",
      a: "It scares off prospects who were comparing on price, and it does lose you some genuine ones, which is the real cost. Ask it as a band, after they have described the problem, and frame it as what the work would be worth rather than as what they have. The prospects who answer it are the ones who had already decided to spend something.",
    },
    {
      q: "Our new business comes from referrals, not ads.",
      a: "Then the Signal step is worth nothing to you and the gate is worth something. If you are not buying traffic there is no wasted ad spend to reclaim, and the arithmetic above collapses to the senior hours. That is a smaller number and you should buy on it or not at all.",
    },
    {
      q: "Is this not just a longer contact form?",
      a: "A longer form collects more fields from everyone and still creates a lead for all of them. This decides, before the opt-in, that some of them do not become a lead at all, routes them somewhere honest, and tells your ad account never to show that ad to anybody like them again. The second half is the part a form cannot do.",
    },
    {
      q: "What happens to my cost per lead?",
      a: "It goes up, and you already know why: you have stopped counting the cheap ones. You also already know which number to show the client version of this argument, so look at cost per signed retainer. That is the one reporting qualified completions to Meta is designed to move.",
    },
  ],
  finalCta: {
    heading: "Fewer pitches. More signed retainers.",
    sub: "We write the gate for your minimum, your services and your ideal account, and take it live with you on one call.",
  },
});

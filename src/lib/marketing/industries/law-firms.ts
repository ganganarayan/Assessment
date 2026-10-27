import { defineIndustry } from "./define";

/**
 * Law firms.
 *
 * 🔴 The gate here screens for PRACTICE AREA, JURISDICTION, TIMELINE and FEE,
 * never for the merits of a case. Merit is legal judgement, it is the firm's to
 * make, and a scorecard that appeared to grade somebody's claim would be both
 * wrong and a problem. The copy says so out loud, in the gate paragraph and in
 * an objection, because this is the page most likely to be read as doing that.
 */
export const LAW_FIRMS = defineIndustry({
  key: "law-firms",
  shortName: "Law firms",
  category: "Law firms",
  keywordSlug: "lead-qualification-for-law-firms",
  cardLine: "Practice area, jurisdiction, timeline and fee, settled before a fee-earner triages.",
  meta: {
    title: "Lead qualification for law firms",
    description:
      "Triaging enquiries that were never matters is the most expensive admin in a law firm. Assess360 settles practice area, jurisdiction, timeline and fee before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The enquiries outside your practice never reach a fee-earner. And your ads learn to stop finding them.",
    sub: "Practice area, jurisdiction, timeline and whether they can meet your fee are settled before the opt-in, so the enquiry somebody would spend fifteen minutes politely declining never arrives. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the signed matter",
  businesses: "firms",
  rivals: "the firms advertising beside you",
  promiseWords:
    "an assessment, an eligibility check, a case review, a claim check, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never become a matter",
  leak: {
    lead: "Every enquiry gets read by somebody whose hour has a rate on it. Most of them are in the wrong practice area, the wrong jurisdiction, or want a fee you do not offer. Here is what buying those costs you every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 150,
    outcomesLabel: "Matters signed a month today",
    outcomesDefault: 10,
    valueLabel: "What one signed matter is worth to you",
    valueHint: "Your average fee for a matter you would actually take.",
    valueDefault: 200000,
    spendDefault: 100000,
    wrongFitHint:
      "A practice area you do not work in, a jurisdiction you are not admitted in, far outside any fee they could meet, long out of time, or somebody who wants ten minutes of free advice. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "matter",
    outcomeUnitPlural: "matters",
    caught: [
      {
        title: "The enquiry never reaches a fee-earner.",
        body: "Practice area, jurisdiction, timeline and fee expectation are asked before the opt-in. An enquiry that does not match is routed to an exit page that says plainly what kind of firm it does need, so nobody drafts a polite decline and nobody is left thinking a solicitor is about to call.",
      },
      {
        title: "The enquiries you do take are triaged before you open them.",
        body: "The practice area, the jurisdiction, the timeline and the fee expectation arrive with the enquiry, so the first read is about whether to take the matter rather than about what the matter even is.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Practice area, jurisdiction, timeline and fee expectation are asked while the visitor is still anonymous, and an enquiry that does not match never reaches the form. 🔴 It does not screen the merits of anybody's case, and the wording is written so that nobody could read it as doing so: that is legal judgement, it is yours, and it happens after this.",
    score: "Everyone who passes is scored on the commercial facts that decide whether a matter is worth opening: the area, the jurisdiction, how urgent it is, the complexity band and the fee expectation. The result tells them what kind of help their situation needs and what to bring to a first conversation, which is useful without being advice.",
    signalOpener: "A gate stops fee-earners triaging enquiries that were never matters.",
    neverNoun: "the enquiries outside your practice and your jurisdiction",
    goodShape: "a matter in your area and your jurisdiction",
    badShape: "somebody who wants ten minutes of free advice",
    optimisesToward: "people with matters your firm actually takes",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per signed matter" },
  after: {
    brief:
      "Your practice areas, your jurisdictions, the fee floor, and the enquiry your team is tired of declining.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a legal enquiry and written to avoid anything that reads as advice.",
    notOurJob:
      "We do not run your ads, we give no legal advice, and the scorecard never assesses the merits of a case.",
  },
  fit: {
    forList: [
      "Fee-earner or paralegal time goes on reading enquiries that were never matters",
      "You advertise, or rank, for terms that attract the wrong practice area",
      "You can state your practice areas and jurisdictions precisely",
      "You have a fee floor below which a matter is not worth opening",
      "You would rather read twenty real enquiries than a hundred mixed ones",
    ],
    notList: [
      "You want the tool to assess whether a claim is any good. It will not",
      "You take anything that walks in and sort it out later",
      "Your work is entirely referral or panel-driven and you buy no traffic",
      "You cannot name an enquiry type that should be turned away",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Is this assessing whether somebody has a case?",
      a: "No, and it is built so that it cannot be read that way. It screens practice area, jurisdiction, timeline and fee, which are facts about whether your firm is the right firm. Merit is advice, it is yours, and the result wording is drafted with your team so that nothing in it sounds like an opinion on a claim.",
    },
    {
      q: "Somebody with a weak enquiry today could be a client next year.",
      a: "They could, and the exit page is written for exactly that: it says what kind of help the situation needs and leaves a way back. What it does not do is create a file, book a call and put somebody on a follow-up sequence on the strength of a maybe.",
    },
    {
      q: "Our enquiries come in by phone, not by form.",
      a: "Then the gate catches whatever share arrives through your website and your ads, and the rest is unchanged. Run the arithmetic above using only your online enquiries. If that number is small, this is not worth buying and we would rather you worked that out here.",
    },
    {
      q: "Our intake team already does this.",
      a: "Inconsistently, and at a salary. A gate asks every enquiry the same questions in the same order at two in the morning, and does it before the enquiry becomes a record somebody has to close out. Your intake team then spends its day on the enquiries that survived it.",
    },
    {
      q: "Will fewer enquiries not look like the marketing has stopped working?",
      a: "For a fortnight, yes. Cost per signed matter is the number that answers it, and it is the one reporting only qualified completions to Meta is designed to move. Enquiry count is an input you can inflate any time by advertising more broadly, which is how you got here.",
    },
  ],
  finalCta: {
    heading: "Fewer enquiries. More matters worth opening.",
    sub: "We write the gate for your practice areas, your jurisdictions and your fee floor, and take it live with you on one call.",
  },
});

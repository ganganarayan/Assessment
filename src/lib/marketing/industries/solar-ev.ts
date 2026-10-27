import { defineIndustry } from "./define";

/**
 * Solar and EV installers.
 *
 * The distinguishing fact is that eligibility here is PHYSICAL: no roof rights
 * means no system, whatever the intent. That makes the gate unusually
 * defensible, and it is why the copy leans on roof ownership rather than on
 * budget. Subsidy amounts are never stated, because they change by state and by
 * year and a marketing page quoting one would be wrong within months.
 */
export const SOLAR_EV = defineIndustry({
  key: "solar-ev",
  shortName: "Solar and EV",
  category: "Solar and EV",
  keywordSlug: null,
  cardLine: "Roof rights, bill size and location, settled before a surveyor drives out.",
  meta: {
    title: "Lead qualification for solar and EV installers",
    description:
      "A tenant reading about subsidies costs the same per click as an owner with a roof. Assess360 settles roof rights, bill size and location before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "No surveyor drives out to a roof that can never take a system. And your ads learn to stop finding them.",
    sub: "Whether they own the roof, what their bill actually is, the shading and the location are settled before the opt-in, so a site survey is never spent on a tenant who read about a subsidy. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the commissioned system",
  businesses: "installers",
  rivals: "the installers quoting against you",
  promiseWords:
    "an assessment, a savings calculator, a rooftop check, a subsidy eligibility check, a grade or an analysis",
  gainNoun: "customers",
  neverVerb: "can never have a system installed",
  leak: {
    lead: "Half the people clicking a solar ad cannot have solar: they rent, they have no roof rights, or their bill is too small to justify anything. Each one still gets a call and sometimes a site survey. Here is what buying them costs every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 400,
    outcomesLabel: "Systems commissioned a month today",
    outcomesDefault: 25,
    valueLabel: "What one commissioned system is worth to you",
    valueHint: "Your margin on an average installation, not the value of the system.",
    valueDefault: 120000,
    spendDefault: 120000,
    wrongFitHint:
      "A tenant with no roof rights, a flat with no individual roof, a bill too small to justify a system, heavy shading, outside the states you install in, or somebody only researching subsidies. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "installation",
    outcomeUnitPlural: "installations",
    caught: [
      {
        title: "The survey never gets scheduled.",
        body: "Roof ownership, property type, bill band, shading and location are asked before the opt-in. An enquiry that fails is routed to an exit page that explains plainly why, so no surveyor drives out, no proposal is modelled, and nobody is called three times about a roof they do not control.",
      },
      {
        title: "The surveys you do run are on viable roofs.",
        body: "Your surveyor arrives knowing the property type, the bill band and the shading, so the visit confirms a system rather than discovering there was never going to be one.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Roof ownership, property type, monthly bill band, shading and location are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No call, no survey, no proposal. Eligibility here is physical, which is what makes it the most honest gate on this list: a tenant without roof rights is not a slow lead, they are not a lead.",
    score: "Everyone who passes is scored on what decides whether a system gets commissioned: bill size against the system it would justify, roof area and shading, ownership, and how soon they intend to act. They get a read on roughly what their roof could carry and what it would do to their bill, which is why they finish it.",
    signalOpener: "A gate stops your surveyors driving to roofs that can never take a system.",
    neverNoun: "the enquiries with no roof rights and no bill worth cutting",
    goodShape: "an owner with their own roof and a bill worth cutting",
    badShape: "a tenant reading about subsidies",
    optimisesToward: "owners with their own roof and a bill worth cutting",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per commissioned system" },
  after: {
    brief:
      "The states and cities you install in, your smallest viable system, the property types you can work with, and what your surveyors waste their diesel on.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for a rooftop enquiry rather than adapted from a generic savings quiz.",
    notOurJob:
      "We do not run your ads, we survey nothing, and we quote no subsidy figures to anybody.",
  },
  fit: {
    forList: [
      "A site survey costs you a surveyor's half-day and the fuel",
      "You run Meta or Google ads at volume",
      "You install in some states and not others",
      "You have a smallest viable system size",
      "Most of your enquiries turn out to be tenants or flats",
    ],
    notList: [
      "You survey remotely at no cost",
      "Your crews are idle and any enquiry is welcome",
      "You install anything anywhere at any size",
      "Your work is all government tenders and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Subsidy ads are what bring the volume. We cannot stop running them.",
      a: "Nobody is asking you to. Keep the ad and change what it lands on. The subsidy message brings a mixed crowd, the gate sorts it in ninety seconds, and the exclusion audience means the ad gradually stops being shown to the people who were never eligible. The creative does the attracting and the gate does the sorting.",
    },
    {
      q: "Asking about ownership up front will lose genuine buyers.",
      a: "Roof ownership is the one question in this industry nobody can be talked around. A tenant cannot buy a rooftop system no matter how good your proposal is, and asking it first costs you nothing except enquiries you could never have served.",
    },
    {
      q: "Our call centre filters this out already.",
      a: "At a cost, inconsistently, and after the lead exists. A gate asks every enquiry the same five questions at any hour and does it before your call centre has a record to work. Your callers then spend the day on roofs that can actually take a system.",
    },
    {
      q: "Can it tell them what subsidy they would get?",
      a: "No, and it will not pretend to. Subsidy schemes differ by state and change, and a page that quotes one is wrong within a year. The result talks about their bill, their roof and what a system would plausibly do, and leaves the scheme specifics to your proposal.",
    },
    {
      q: "Will my lead cost not go up?",
      a: "Yes, because you stop buying the cheap unqualified ones. Cost per commissioned system is the number that falls, and reporting only qualified completions to Meta is what teaches the account the difference between a homeowner and somebody curious about subsidies.",
    },
  ],
  finalCta: {
    heading: "Fewer surveys. More systems commissioned.",
    sub: "We write the gate for your states, your system sizes and your roof requirements, and take it live with you on one call.",
  },
});

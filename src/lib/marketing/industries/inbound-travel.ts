import { defineIndustry } from "./define";

/**
 * Inbound travel: an Indian operator selling an India trip to a traveller in the
 * US, the UK or Australia.
 *
 * The audience the currency switch was built for. Almost every reader of this
 * page quotes in dollars and pounds to travellers who think in dollars and
 * pounds, while banking in a different currency entirely, so the calculator
 * opening in the visitor's own currency matters here more than anywhere else on
 * the list.
 */
export const INBOUND_TRAVEL = defineIndustry({
  key: "inbound-travel",
  shortName: "Inbound travel",
  category: "Inbound travel",
  keywordSlug: null,
  cardLine: "Dates, party size and budget per day, settled before anyone builds an itinerary.",
  meta: {
    title: "Lead qualification for inbound travel operators",
    description:
      "A custom itinerary built for free is a day of your team's work handed to whoever quotes cheapest. Assess360 settles dates, party size and budget before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "Nobody gets a custom itinerary for free. And your ads learn to stop finding the people who ask for one.",
    sub: "Travel dates, party size, the budget per person per day and whether the trip is actually decided are settled before the opt-in, so your team stops building day-by-day plans for people collecting quotes. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the confirmed booking",
  businesses: "operators",
  rivals: "the operators quoting against you",
  promiseWords:
    "an assessment, a trip planner, a free itinerary, a suitability check, a grade or an analysis",
  gainNoun: "travellers",
  neverVerb: "can never book at your rate",
  leak: {
    lead: "The itinerary is the product, and you give it away before anyone pays. A travel designer spends a day on a fourteen-day plan, the traveller forwards it to three operators for a cheaper quote, and you paid for the click that started it. Here is what that costs every month.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 200,
    outcomesLabel: "Confirmed bookings a month today",
    outcomesDefault: 8,
    valueLabel: "What one confirmed booking is worth to you",
    valueHint: "Your margin on an average trip, not the total price the traveller pays.",
    valueDefault: 250000,
    spendDefault: 150000,
    wrongFitHint:
      "Budget per day nowhere near what you operate at, no fixed dates and none for two years, a party size you do not handle, a backpacker enquiring about a private tour, or somebody collecting itineraries to travel independently. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "confirmed booking",
    outcomeUnitPlural: "confirmed bookings",
    caught: [
      {
        title: "No itinerary gets built.",
        body: "Dates, party size, budget per person per day and how decided the trip is are asked before the opt-in. An enquiry that fails is routed to an exit page with genuinely useful planning guidance on it, so no travel designer spends a day on a plan that was going to be shopped around.",
      },
      {
        title: "The itineraries you do build are for people who travel.",
        body: "The dates, the party size and the daily budget arrive with the enquiry, so the first draft is close to right and the conversation is about the trip rather than about what it will cost.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Travel dates, party size, budget per person per day and whether the trip is decided are asked while the visitor is still anonymous, and an enquiry that fails never reaches the form. No designer assigned, no day-by-day plan, no quote to be undercut.",
    score: "Everyone who passes is scored on what decides whether a trip gets confirmed: how firm the dates are, the daily budget against how you operate, the party size, and whether they are deciding or still dreaming. They get a read on what their budget realistically buys in India at their dates, which is the question they actually came with and the reason they finish it.",
    signalOpener: "A gate stops your designers building itineraries nobody pays for.",
    neverNoun: "the enquiries that will never book at your rate",
    goodShape: "a traveller with firm dates and a real daily budget",
    badShape: "somebody collecting itineraries to copy",
    optimisesToward: "travellers with firm dates and a budget at your rate",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per confirmed booking" },
  after: {
    brief:
      "The trips you want more of, your minimum per person per day, the source markets you sell to, and the enquiry that always ends in a free itinerary.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for an inbound traveller rather than adapted from a generic quiz, in the English your source market reads.",
    notOurJob: "We do not run your ads and we plan or operate none of your trips.",
  },
  fit: {
    forList: [
      "A custom itinerary costs you a designer's day before anyone has paid",
      "You run Meta or Google ads into overseas source markets",
      "You have a minimum per person per day",
      "Your quotes get shopped against cheaper operators",
      "You would rather design twenty trips and confirm eight than a hundred and confirm eight",
    ],
    notList: [
      "You sell fixed departures off the shelf where a quote costs you nothing",
      "Your designers are idle and any enquiry is welcome",
      "You compete on being the cheapest quote and that is working",
      "All your business comes from overseas agents and you buy no traffic",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Travellers expect a free itinerary. That is the industry.",
      a: "It is, and it is why margins in this industry are what they are. The gate does not stop you giving one, it stops you giving one to somebody with no dates and a third of your daily budget. The enquiries that pass still get the full treatment, and your designers have the hours to do it properly.",
    },
    {
      q: "Nobody knows their budget before they have seen an itinerary.",
      a: "They know a band per person per day once you frame it as what the trip style costs, and the result telling them what their band actually buys in India is the most useful page they will read while planning. What nobody can answer is a request for a total, which is why the gate never asks for one.",
    },
    {
      q: "My enquiries come from several countries with very different budgets.",
      a: "Which is routing rather than a problem: the band question is per person per day, so it reads the same to a reader in London and one in Sydney. The page itself opens in the visitor's own currency for the same reason, from their country, with a toggle in case it guesses wrong.",
    },
    {
      q: "Our enquiries come from overseas travel agents, not consumers.",
      a: "Then the gate should face the agent, and the questions change: volume, season, the client profile they sell. That is a different scorecard and worth saying on the call. If every enquiry you get is from a long-standing agent relationship, you are buying no traffic and this is not for you.",
    },
    {
      q: "Will enquiry volume not collapse?",
      a: "It will fall, and cost per enquiry will rise. Cost per confirmed booking is the number that falls, because the exclusion audience stops the ad reaching backpackers and the qualified-only conversion event teaches Meta what a traveller who books at your rate looks like.",
    },
  ],
  finalCta: {
    heading: "Fewer itineraries. More confirmed bookings.",
    sub: "We write the gate for your daily rate, your source markets and your trip style, and take it live with you on one call.",
  },
});

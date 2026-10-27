import { defineIndustry } from "./define";

/**
 * Coaches. The audience most likely to be running ads to a calendar link, which
 * is why the leak here is measured in discovery calls rather than in leads.
 */
export const COACHES = defineIndustry({
  key: "coaches",
  shortName: "Coaches",
  category: "Coaches",
  keywordSlug: "lead-qualification-for-coaches",
  featured: true,
  cardLine:
    "Budget, readiness and the actual problem, settled before anyone takes a slot in your diary.",
  meta: {
    title: "Lead qualification for coaches",
    description:
      "A diary full of discovery calls is not a business. Assess360 settles budget, readiness and the real problem before the opt-in, scores everyone who passes, and teaches your ad account to stop finding people collecting free advice.",
  },
  hero: {
    headline:
      "The free-advice calls never get booked. And your ads learn to stop finding the people who book them.",
    sub: "What they can invest, how ready they are to start, and the problem they actually have are settled before the opt-in, so the call you would end at minute eight never takes a slot in your diary. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the discovery call and the signed client",
  businesses: "coaches",
  rivals: "the other coaches in your niche",
  promiseWords:
    "an assessment, a readiness check, a clarity score, a diagnostic, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never become a client",
  leak: {
    lead: "Your calendar fills, which feels like the funnel is working. Then two thirds of those calls were never going to buy anything, and you paid for every one of them twice: once in ad spend and once in the hour. Here is that budget, and here is what it buys once it stops.",
    enquiriesLabel: "Discovery calls booked a month",
    enquiriesDefault: 60,
    outcomesLabel: "Clients signed a month today",
    outcomesDefault: 6,
    valueLabel: "What one client is worth to you",
    valueHint: "The whole programme at your real price, not your deposit and not an hourly rate.",
    valueDefault: 75000,
    spendDefault: 100000,
    wrongFitHint:
      "Nowhere near your price, not ready to start for a year, wanting one free hour rather than a programme, carrying a problem you do not work on, or needing a therapist rather than a coach. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "booking",
    outcomeUnit: "client",
    outcomeUnitPlural: "clients",
    caught: [
      {
        title: "The call never gets booked.",
        body: "Investment band, readiness and the actual problem are asked before the opt-in. Somebody who cannot answer them is routed to an exit page with something genuinely useful on it, so your diary stays empty where it should be and nobody sits through a call you both knew was going nowhere.",
      },
      {
        title: "The calls you do take open at the work.",
        body: "You know what they can invest, what they have already tried and how soon they want to start, so the hour goes on the coaching rather than on establishing whether this is a conversation worth having.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. What they can invest, how ready they are and what they are actually trying to fix are asked while the visitor is still anonymous, and somebody who cannot answer them never reaches your calendar link. No booking, no reminder sequence, no hour to get back.",
    score: "Everyone who passes is scored on what decides whether coaching works: how acute the problem is, what they have tried, how ready they are to change something, and what they can invest. They get a result that names where they are and what the honest next step is, which is why they finish it rather than closing the tab.",
    signalOpener: "A gate keeps your diary for people who can actually hire you.",
    neverNoun: "the people who will never pay for coaching",
    goodShape: "somebody with a problem worth solving and the money to solve it",
    badShape: "somebody collecting free advice",
    optimisesToward: "people who can invest at your price and want to start now",
  },
  costPer: { before: "Cost per booked call", after: "Cost per signed client" },
  after: {
    brief:
      "Who you coach, what the programme costs, and the three kinds of call you wish you had never taken.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted for your niche rather than adapted from a generic quiz.",
    notOurJob: "We do not run your ads and we do not coach anybody.",
  },
  fit: {
    forList: [
      "You run ads or paid promotion to a calendar link or an opt-in",
      "Your hours are the product, so a wasted call is a wasted unit of inventory",
      "You can name your price out loud without flinching",
      "You would rather take four good calls than twelve polite ones",
      "You can say which answer means somebody is not ready to be coached",
    ],
    notList: [
      "You are still working out who you coach and what you charge",
      "Your calendar is empty and you want the practice",
      "You sell a low-ticket product where a call is not involved",
      "You believe every call converts if you handle the objection well enough",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "I can close almost anyone on a call. Why filter first?",
      a: "Possibly, and the question is what it costs. If it takes two unpaid hours to close somebody who cannot really afford the programme, you have bought a difficult client at a discount. The gate does not decide who you can persuade, it decides who gets to take the hour.",
    },
    {
      q: "Asking about money up front feels wrong.",
      a: "Ask it as what they are ready to invest in fixing this, in bands, after they have told you the problem, and it reads as part of the diagnosis rather than as a credit check. The people who leave at that question were never going to say yes at the end of the call either, and you learned it in ninety seconds instead of ninety minutes.",
    },
    {
      q: "My free call IS my sales process.",
      a: "It still is. This only decides who reaches it. The call stays exactly as it was, with the first fifteen minutes of qualifying already done and the answers in front of you when you join.",
    },
    {
      q: "Fewer bookings will look like the ads stopped working.",
      a: "They will, for about a fortnight, and then cost per signed client is the number you will want to look at. Bookings are an input you can always buy more of by lowering the bar. Clients are the output, and the point of reporting only qualified completions to Meta is that the account starts hunting for those instead.",
    },
    {
      q: "Will this not just let good prospects disqualify themselves?",
      a: "Some will, and that is the one real cost of doing this. It is why the gate asks about readiness and investment in bands rather than demanding a number, and why the exit page gives them something useful and a way back. A prospect who leaves at an honest question was going to leave at the price.",
    },
  ],
  finalCta: {
    heading: "An emptier diary. More signed clients in it.",
    sub: "We write the gate for your niche, your price and your kind of client, and take it live with you on one call.",
  },
});

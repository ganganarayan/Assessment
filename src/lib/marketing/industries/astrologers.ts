import { defineIndustry } from "./define";

/**
 * Astrologers running paid consultations.
 *
 * 🔴 This page takes no position on astrology and makes no claim about outcomes.
 * It is about one commercial fact: a practice that answers free questions on
 * WhatsApp all day has no hours left to sell. The gate sorts paid consultations
 * from free questions, and nothing in the copy says anything about what a
 * reading does.
 */
export const ASTROLOGERS = defineIndustry({
  key: "astrologers",
  shortName: "Astrologers",
  category: "Astrologers",
  keywordSlug: null,
  cardLine: "Service, budget and birth details, settled before you answer another free question.",
  meta: {
    title: "Lead qualification for astrologers",
    description:
      "Answering free questions all day leaves no hours to sell. Assess360 settles which consultation, the budget and the details you need before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The one-free-question messages never reach you. And your ads learn to stop finding them.",
    sub: "Which consultation they want, what they can spend, and whether they have the details you need to do the work are settled before the opt-in, so your day stops going on questions nobody pays for. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the paid consultation",
  businesses: "practices",
  rivals: "the astrologers advertising beside you",
  promiseWords: "a free reading, an assessment, a compatibility check, a chart analysis or a report",
  gainNoun: "clients",
  neverVerb: "can never pay for a consultation",
  leak: {
    lead: "The business problem here is not demand, it is that demand arrives as free questions. Hundreds of enquiries, a handful of paid consultations, and a day spent typing answers on WhatsApp. Here is what buying those enquiries costs every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 500,
    outcomesLabel: "Paid consultations a month today",
    outcomesDefault: 60,
    valueLabel: "What one paid consultation is worth to you",
    valueHint: "Your real fee, for the consultation or report people actually buy.",
    valueDefault: 5000,
    spendDefault: 60000,
    wrongFitHint:
      "Wanting one free answer and nothing more, nowhere near your fee, asking for a service you do not offer, without the birth details the work needs, or in a language you do not consult in. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "most",
    unit: "enquiry",
    outcomeUnit: "paid consultation",
    outcomeUnitPlural: "paid consultations",
    caught: [
      {
        title: "The free question never reaches you.",
        body: "Which consultation, the fee band and whether they have their birth details are asked before the opt-in. An enquiry that cannot answer them is routed to an exit page, so nothing lands in your messages, nobody waits for a reply, and your day is not spent on work nobody is paying for.",
      },
      {
        title: "The consultations you do take are ready to start.",
        body: "The service, the fee band and the details you need arrive with the booking, so you begin the work instead of asking for a date of birth four times.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Which consultation, the fee band and whether they have the details the work requires are asked while the visitor is still anonymous, and an enquiry that fails never reaches you. No message to answer, no slot to hold, no free reading to deliver.",
    score: "Everyone who passes is scored on what separates a paying client from a passer-by: which service they want, how specific their question is, how soon they want it and what they can spend. They get a result that names which consultation fits their question, which is a useful answer in itself and the reason they complete it.",
    signalOpener: "A gate keeps your hours for people who pay rather than ask one free question.",
    neverNoun: "the people who only ever want one free answer",
    goodShape: "somebody who books and pays for a consultation",
    badShape: "somebody asking one question for free",
    optimisesToward: "people who book and pay for a consultation",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per paid consultation" },
  after: {
    brief:
      "The consultations you offer and their fees, the languages you work in, and the kind of message that eats your day.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted around your services and your fees.",
    notOurJob:
      "We do not run your ads, we do no consulting, and the scorecard makes no prediction about anything.",
  },
  fit: {
    forList: [
      "Your day goes on free questions rather than paid work",
      "You run ads or paid promotion to WhatsApp or a form",
      "You offer more than one service at more than one fee",
      "You can state your fee without negotiating it in chat",
      "You would rather do fifty paid consultations than five hundred conversations",
    ],
    notList: [
      "Free questions are your marketing and they convert well enough",
      "You are building an audience and every message is welcome",
      "You charge so little that almost anybody is a plausible buyer",
      "You run no paid traffic, so there is no spend to reclaim",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "The free question IS how people come to trust me.",
      a: "For some it is, and you can keep a free entry point. What this changes is that the free thing becomes a page rather than your afternoon: the exit page can answer the common question once, for everybody, while your hours go to the people who booked. A funnel where the free part scales and the paid part does not is the one that works.",
    },
    {
      q: "My enquiries all come through WhatsApp.",
      a: "Then put the scorecard in front of the WhatsApp link, in the ad and in your bio. People complete it and the qualified ones arrive in your chat with their service, their fee band and their details already attached. The ones who do not complete it never reach the chat, which is the whole saving.",
    },
    {
      q: "Asking about fees before a reading feels transactional.",
      a: "Asking for a number would be. Naming which consultation they want, each with its fee shown, is a menu, and every practice that gets paid properly has one somewhere. The people who leave at a menu were not going to pay at the end of a free conversation either.",
    },
    {
      q: "I consult in several languages and for several traditions.",
      a: "That is routing rather than a problem. The gate can disqualify only what you genuinely cannot serve, a language you do not speak, and the score sends everybody else to the right service. Multiple services is the normal setup rather than an edge case.",
    },
    {
      q: "Will my enquiry numbers not drop hard?",
      a: "Hard, yes, because most of them were never going to pay. Cost per paid consultation is the number to watch, and reporting only qualified completions to Meta is what makes the account stop finding people who click on free readings.",
    },
  ],
  finalCta: {
    heading: "Fewer messages. More paid consultations.",
    sub: "We write the gate for your services, your fees and your languages, and take it live with you on one call.",
  },
});

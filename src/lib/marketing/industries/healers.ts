import { defineIndustry } from "./define";

/**
 * Wellness and energy-healing practitioners.
 *
 * 🔴 Two lines this page does not cross. It makes no claim about what any
 * modality does, because that is not ours to make and not what we sell. And the
 * gate never asks about symptoms or conditions: it asks about the SERVICE they
 * want, the format, the budget and the location. A scorecard collecting health
 * details would be a data-protection problem the customer inherits, and one that
 * appeared to triage a medical issue would be worse. The objections say both out
 * loud, and one of them routes anybody describing an emergency to a doctor.
 */
export const HEALERS = defineIndustry({
  key: "healers",
  shortName: "Healers and wellness practitioners",
  category: "Healers",
  keywordSlug: null,
  cardLine: "Service, format, budget and location, settled before you hold an hour open.",
  meta: {
    title: "Lead qualification for wellness and healing practitioners",
    description:
      "Your hours are the product, and a no-show costs you the whole slot. Assess360 settles which service, which format, the budget and the location before the opt-in, scores everyone who passes, and reports only qualified enquiries back to Meta.",
  },
  hero: {
    headline:
      "The enquiries that were never going to book never take your time. And your ads learn to stop finding them.",
    sub: "Which service they want, whether they need it in person or online, what they can spend and where they are are settled before the opt-in, so you stop holding hours for people who were curious. Everyone who passes is scored, and only the qualified ones are reported back to Meta.",
  },
  gap: "the gap between the enquiry and the booked session",
  businesses: "practices",
  rivals: "the other practitioners in your city",
  promiseWords:
    "an assessment, a wellness check, a balance score, a questionnaire, a grade or an analysis",
  gainNoun: "clients",
  neverVerb: "can never book a paid session",
  leak: {
    lead: "You sell hours and you cannot make more of them. An enquiry that was only curious still takes a conversation, sometimes a held slot, and occasionally a free first session. Here is what buying those enquiries costs every month, and what the same budget buys once it stops.",
    enquiriesLabel: "Enquiries a month",
    enquiriesDefault: 150,
    outcomesLabel: "Paying clients a month today",
    outcomesDefault: 20,
    valueLabel: "What one paying client is worth to you",
    valueHint: "A full package or course of sessions at your real price, not one session.",
    valueDefault: 15000,
    spendDefault: 40000,
    wrongFitHint:
      "Wanting a modality you do not practise, needing in-person sessions from another city, nowhere near your price, wanting a free first session and nothing after it, or looking for medical treatment rather than what you offer. Pick the honest band, then change the number if you know it.",
    wrongFitDefaultBand: "two-thirds",
    unit: "enquiry",
    outcomeUnit: "paying client",
    outcomeUnitPlural: "paying clients",
    caught: [
      {
        title: "The slot never gets held.",
        body: "Which service, which format, the budget band and the location are asked before the opt-in. An enquiry that does not match is routed to an exit page with something useful on it, so no hour is held open, no reminder goes out, and nobody is chased about a session they were never going to take.",
      },
      {
        title: "The clients you do see have chosen the work.",
        body: "They have told you which service they want, in which format, and what they can spend, so the first session starts at the work rather than at explaining what you do and what it costs.",
      },
    ],
  },
  mechanism: {
    gate: "The screen runs before the opt-in, not after it. Which service, in-person or online, the budget band and the location are asked while the visitor is still anonymous, and an enquiry that does not match never reaches your calendar. 🔴 It asks about the SERVICE, never about symptoms or health conditions: that keeps sensitive data out of the funnel entirely, which is better for them and simpler for you.",
    score: "Everyone who passes is scored on what decides whether somebody actually starts: which service they want, whether the format suits them, how soon they want to begin, and what they can spend. They get a result that points at the right service and the right starting format, which is why they finish it rather than closing the tab.",
    signalOpener: "A gate keeps your hours for people who intend to turn up and pay.",
    neverNoun: "the people who will never book a paid session",
    goodShape: "somebody who wants the work you actually do",
    badShape: "somebody who wanted one free conversation",
    optimisesToward: "people who book and pay for sessions",
  },
  costPer: { before: "Cost per enquiry", after: "Cost per paying client" },
  after: {
    brief:
      "The services you offer, your prices, whether you work online or in person, and the enquiry you most often wish you had not replied to.",
    scorecard:
      "The gate questions, the weights, the result bands and the wording, drafted around your services and written to ask nothing about anybody's health.",
    notOurJob:
      "We do not run your ads, we make no claim about what your practice does, and the scorecard collects no health information.",
  },
  fit: {
    forList: [
      "Your hours are the product and an empty held slot is a real loss",
      "You run ads or paid promotion to a booking link",
      "You offer more than one service and people enquire for the wrong one",
      "You can name your price without discounting on the call",
      "You would rather see fifteen committed clients than fifty enquiries",
    ],
    notList: [
      "You are building a practice and every conversation is worth having",
      "Your calendar is empty and you want the experience",
      "You want the tool to screen health conditions. It does not and must not",
      "You take no paid traffic at all, so there is no spend to reclaim",
      "You want somebody to run the ads for you. This is software you operate",
    ],
  },
  objections: [
    {
      q: "Filtering people who need help feels wrong.",
      a: "Nothing here is about who deserves help. It is about who can book a paid session with you, in the format you offer, in the place you work. Somebody in another city who needs in-person work is not served by getting onto your calendar, and the exit page is written to point them somewhere better rather than nowhere.",
    },
    {
      q: "Can it ask what condition somebody has?",
      a: "It can and it will not. Health details are sensitive data, they would sit in your funnel and your CRM, and you would own that problem. The gate asks which SERVICE they want, which is enough to route them and carries none of that risk. If somebody needs a clinical assessment, the honest answer is a doctor, and the exit wording says so.",
    },
    {
      q: "My clients come from word of mouth and Instagram.",
      a: "Then the gate does little and the Signal step does nothing, because there is no ad budget to recover. Put your real paid spend into the arithmetic above. If it is near zero, this is not worth buying yet and we would rather you knew that now.",
    },
    {
      q: "A free first session is how I build trust.",
      a: "It can be, and you can keep it. What this changes is who gets offered one: somebody who has told you which service they want, in which format, and what they can spend afterwards. A free session given to somebody who could never pay for the second one is a gift rather than a funnel.",
    },
    {
      q: "Will fewer enquiries not mean fewer clients?",
      a: "Fewer enquiries, and the arithmetic above says whether that means fewer clients. If two thirds of your enquiries can never book, the same ad budget spent only on the other third buys more of them, not less. Enter your own numbers and let them answer it.",
    },
  ],
  finalCta: {
    heading: "An emptier calendar. More paying clients in it.",
    sub: "We write the gate for your services, your formats and your prices, and take it live with you on one call.",
  },
});

import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "meta-ads-lead-qualification",
  kind: "pillar",
  topicId: "meta-ads",
  intent:
    "Someone running Facebook or Instagram ads that produce plenty of leads and almost no customers, who suspects the problem is what the campaign is being told counts as a conversion.",
  primaryKeyword: "meta ads lead qualification",
  secondaryKeywords: [
    "facebook ads unqualified leads",
    "improve lead quality meta ads",
    "qualified lead conversion event",
    "meta ads lead quality",
  ],
  title: "Meta Ads Lead Qualification: Fix Lead Quality",
  description:
    "Why Meta ads produce unqualified leads, how a qualified-only conversion event changes what the campaign optimises for, and what to send back for each outcome.",
  h1: "Assess360: tell Meta which leads were actually worth having",
  shortName: "Meta ads",
  lede:
    "Meta optimises for whatever you tell it counts. Report a form fill and it will find people who fill in forms; report a qualified lead and it goes looking for people who qualify. Lead quality is usually not a targeting problem, it is a feedback problem, and the feedback is something you control.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-scoring", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "feedback-loop",
      heading: "The campaign learns from the event you send it",
      answer:
        "Optimisation is a feedback loop, and the event you report is the only thing in it the advertiser controls.",
      paragraphs: [
        "The targeting conversation misses this. Meta's delivery system is extremely good at finding more people like the ones who completed the event you nominated, which means the event is the instruction. Nominate the form fill and the instruction is find more form fillers, which it will carry out faithfully and cheaply.",
        "The fix is not a better audience or a different creative. It is to move the reported conversion to the moment a lead turns out to be worth having, and to let the system re-learn from there.",
      ],
      bullets: [],
    },
    {
      id: "qualified-only",
      heading: "A qualified-only conversion event",
      answer:
        "Fire the conversion when someone passes qualification, not when they submit, so the optimisation target is the outcome you actually want.",
      paragraphs: [
        "In Assess360 the gate runs before the opt-in. Someone who answers a disqualifying question never becomes a lead, so there is nothing to report but the rejection; someone who passes produces a qualified completion, and that is the event the campaign is optimised on.",
        "Volume drops when you do this, and that is the point. The cost per reported conversion rises because the thing being counted is rarer and worth more. Judging the change on cost per lead will always make it look like a mistake.",
      ],
      bullets: [
        "The conversion fires on qualification, not on submission",
        "Disqualified visitors produce an exclusion signal and no lead record",
        "Both are sent server-side, so ad blockers do not decide what gets counted",
        "The event is deduplicated against the browser pixel by a shared event id",
      ],
    },
    {
      id: "exclusion",
      heading: "Exclusion is the other half of the loop",
      answer:
        "Telling Meta who did not qualify is as useful as telling it who did, because it builds an audience the campaign can stop paying for.",
      paragraphs: [
        "Most advertisers only ever send positive events, so the system learns what success looks like and never learns what to avoid. A custom event for the people who were turned away populates an audience you can exclude from delivery.",
        "This is also the one signal that carries no personal data at all. A rejected visitor hands over nothing, and the event still works, because the match keys that matter are the ones the browser already holds.",
      ],
      bullets: [],
    },
    {
      id: "server-side",
      heading: "Send it from the server, not only the browser",
      answer:
        "A browser event can be blocked, a server event cannot, and a qualification outcome is known on the server anyway.",
      paragraphs: [
        "Qualification happens when the score is computed, which is server-side work. Reporting it from there means every qualified lead is counted rather than the share whose browser allowed a pixel to fire, and the two are deduplicated on a shared id so nothing is counted twice.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Optimise on qualified, not on submitted",
    body: "Put the gate in front of the opt-in, report the qualified completion as the conversion, and exclude the rest. Same spend, different instruction.",
  },
};

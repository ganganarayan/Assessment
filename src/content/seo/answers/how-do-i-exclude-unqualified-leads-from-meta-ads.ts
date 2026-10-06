import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "how-do-i-exclude-unqualified-leads-from-meta-ads",
  question: "How do I exclude unqualified leads from my Meta ads?",
  short:
    "Fire a custom event when someone fails qualification, build a custom audience from that event, and exclude it from your ad sets so the campaign stops paying to reach more people like them.",
  topicId: "meta-ads",
  primaryKeyword: "exclude unqualified leads from meta ads",
  secondaryKeywords: [
    "meta exclusion audience",
    "stop meta ads bad leads",
    "disqualified traffic exclusion",
  ],
  related: ["what-is-a-qualified-only-conversion-event", "can-i-retarget-only-the-leads-that-qualified"],
  updatedAt: "2026-10-06",
  body: [
    {
      id: "the-missing-signal",
      heading: "Most accounts only ever send good news",
      answer:
        "Advertisers report conversions and nothing else, so the system learns what success looks like and never learns what to avoid.",
      paragraphs: [
        "A rejection is information. Someone who answered two questions and turned out to be outside your service area, below your minimum, or looking for something you do not sell is a precise example of who not to find again.",
        "Sending that as its own custom event gives you an audience of exactly those people, which can then be excluded from delivery.",
      ],
      bullets: [],
    },
    {
      id: "no-personal-data",
      heading: "The exclusion signal carries no personal data",
      answer:
        "A disqualified visitor never hands over a name, email or phone number, and the event still works without them.",
      paragraphs: [
        "This surprises people, but the identifiers that do the matching for a website event are the ones the browser already carries, and they are present whether or not a form was filled in. Nothing about the person needs to be stored to tell the platform not to look for more like them.",
        "It is also why this is the one piece of feedback that is safe to send in sensitive categories, where collecting an email from someone you are turning away would be the wrong thing to do.",
      ],
      bullets: [],
    },
    {
      id: "practical",
      heading: "Doing it without inflating the numbers",
      answer:
        "Send the event once per rejected visitor, not on every return visit, or the audience count will exceed the number of people in it.",
      paragraphs: [
        "A rejected visitor who comes back and is turned away again is the same person, and firing again each time makes the audience look larger than the population it represents. Assess360 sends it once and then refreshes it only when membership would otherwise lapse, which keeps the exclusion alive without counting the same rejection repeatedly.",
      ],
      bullets: [],
    },
  ],
};

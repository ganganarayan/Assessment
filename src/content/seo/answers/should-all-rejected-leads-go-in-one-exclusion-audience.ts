import type { Answer } from "@/lib/seo/types";

export const answer: Answer = {
  slug: "should-all-rejected-leads-go-in-one-exclusion-audience",
  question: "Should every rejected lead go in the same exclusion audience?",
  short:
    "No, because one event should mean one thing: if you would ever build two different audiences from it, it needs to be two events or one event split by a parameter.",
  topicId: "meta-ads",
  primaryKeyword: "meta exclusion audience segmentation",
  secondaryKeywords: [
    "one event one meaning",
    "content_category custom audience",
    "exclusion audience mistakes",
  ],
  related: [
    "how-do-i-exclude-unqualified-leads-from-meta-ads",
    "can-i-retarget-only-the-leads-that-qualified",
    "what-do-i-do-with-a-lead-who-cannot-start-yet",
  ],
  updatedAt: "2026-10-12",
  body: [
    {
      id: "the-rule",
      heading: "One event, one meaning",
      answer:
        "An event is a label you are asking the ad platform to learn from. Two outcomes under one label means it learns the average of two different things.",
      paragraphs: [
        "A gate usually turns people away for more than one reason. Wrong role, wrong size, wrong intent, wrong timing: these look alike on a dashboard and are not alike at all. Pooling them into a single exclusion event excludes people you would gladly sell to alongside people you never would.",
        "The test is simple. If you can imagine ever wanting to build a separate audience from part of that group, it was never one event.",
      ],
      bullets: [],
    },
    {
      id: "split-without-splitting-volume",
      heading: "Split by parameter before splitting by name",
      answer:
        "Two outcomes that share a job can share an event name and carry a parameter that tells them apart. Two outcomes with different jobs need different names.",
      paragraphs: [
        "A wrong-role visitor and a wrong-fit practitioner share a job: keep both out of the ad set. Keeping them on one event preserves volume, which matters on a small account where two thin events each learn nothing, and a parameter such as content_category still lets you cut one out later.",
        "A timing failure has a different job, so it gets a different event or none. The thing you must never do is let it reach the event your campaigns optimise toward.",
      ],
      bullets: [
        "Same job, keep volume together: one event, split by parameter.",
        "Different job: its own event name.",
        "Not a rejection at all: keep it out of the exclusion audience entirely.",
      ],
    },
  ],
};

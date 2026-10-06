import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-law-firms",
  kind: "use-case",
  intent:
    "A law firm paying for enquiries and spending fee-earner time on matters outside its practice areas, outside its jurisdiction, or with no viable path to being paid, wanting an intake screen.",
  primaryKeyword: "lead qualification for law firms",
  secondaryKeywords: [
    "legal lead qualification",
    "law firm intake screening",
    "qualify legal enquiries",
    "legal client intake form",
  ],
  title: "Lead Qualification for Law Firms",
  description:
    "How firms screen enquiries on matter type, jurisdiction, timing and funding before a fee earner reads them, and why intake is where the margin is lost.",
  h1: "Assess360 for law firms: screen intake before a fee earner reads it",
  shortName: "For law firms",
  lede:
    "Legal intake is where the margin goes. Matters outside the practice area, outside the jurisdiction, out of time, or with no viable funding all arrive looking like work, and each one costs fee-earner minutes to rule out. Those four facts are exactly what an intake screen can establish.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "scorecard"],
  sections: [
    {
      id: "four-filters",
      heading: "Four filters remove most unworkable enquiries",
      answer:
        "Matter type, jurisdiction, timing and funding - in that order, because each one can end the enquiry on its own.",
      paragraphs: [
        "Matter type is the obvious one and the one most intake forms get wrong by offering a free-text box. A list of the matters the firm actually takes, with an honest other option, sorts the majority of enquiries in a single question.",
        "Timing matters because some matters have deadlines that have already passed, and funding matters because an enquiry with no route to payment is not an instruction however strong the merits.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What an intake screen should ask",
      answer:
        "Enough to route the enquiry to the right team or to decline it politely, and nothing that invites privileged detail before the firm has accepted the matter.",
      paragraphs: [
        "Intake screening deliberately stays shallow. The purpose is to decide whether a conversation should happen and with whom, not to take instructions, and a form that invites a full account of a dispute creates a file nobody has agreed to open.",
      ],
      bullets: [
        "What kind of matter is this",
        "Where did it happen, and where are you based",
        "When did it happen, or when is the deadline",
        "Has another firm advised on it already",
        "How are you expecting to fund it",
      ],
    },
    {
      id: "conflicts",
      heading: "A declined enquiry leaves nothing behind",
      answer:
        "An answer that rules the matter out ends the run before contact details or detail about the dispute are stored.",
      paragraphs: [
        "That is the right behaviour for a firm: no file, no retention obligation, and no half-record of a matter the firm never took. The enquirer sees a page that explains what the firm does handle and where else to look, which is more useful to them than silence.",
        "This is intake screening and not legal advice, and the page should say so in those words.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Move intake ahead of the fee earner",
    body: "Screen on matter, jurisdiction, timing and funding, route what fits to the right team, and decline the rest with something useful.",
  },
};

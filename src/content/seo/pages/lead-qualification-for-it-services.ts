import type { SeoPage } from "@/lib/seo/types";

export const page: SeoPage = {
  slug: "lead-qualification-for-it-services",
  kind: "use-case",
  intent:
    "A software development or IT services firm receiving project enquiries with no budget, no stack fit and no decision process, wanting to establish scope and funding before writing a proposal.",
  primaryKeyword: "lead qualification for it services",
  secondaryKeywords: [
    "software development lead qualification",
    "it services lead qualification",
    "qualify software project enquiries",
    "technology consulting lead screening",
  ],
  title: "Lead Qualification for IT and Software Firms",
  description:
    "How development and IT services firms establish scope, stack and funding before writing a proposal, so estimating time goes to projects that exist.",
  h1: "Assess360 for IT and software firms: qualify before you estimate",
  shortName: "For IT services",
  lede:
    "An estimate is the most expensive thing a software firm gives away, and most of them are written for projects that were never funded. Scope, stack, funding and decision process are establishable on a form, and together they decide whether an estimate is worth the days it takes.",
  updatedAt: "2026-10-06",
  internalLinks: ["lead-qualification-software", "lead-scoring", "qualify-leads-before-sales-call"],
  sections: [
    {
      id: "estimate-cost",
      heading: "The estimate is the cost, not the call",
      answer:
        "A serious proposal takes senior days, so the question is not whether to take the call but whether to open the estimate.",
      paragraphs: [
        "This is what makes IT services different from most of the verticals on this site. The first call is cheap; the scoping and the estimate are not, and firms routinely produce both for enquiries that had no budget from the start.",
        "Scoring the enquiry decides how much work the next step deserves: a short call, a paid discovery, or a full proposal.",
      ],
      bullets: [],
    },
    {
      id: "questions",
      heading: "What to establish before scoping",
      answer:
        "Budget range, stack and constraints, who decides, and whether there is an internal team the work has to sit alongside.",
      paragraphs: [
        "The stack question does double duty: it filters work the firm does not want and it reveals how much of the existing system the project has to live with, which is usually where the real cost sits.",
      ],
      bullets: [
        "What is the budget range you are planning around",
        "What is it built on today, if anything",
        "Is there an in-house team, and what will they own",
        "Who signs off, and what is the decision date",
        "Any compliance or security requirements we should know about",
      ],
    },
    {
      id: "paid-discovery",
      heading: "Route the strong ones to paid discovery",
      answer:
        "The best outcome for a well-scored enquiry is often a paid discovery rather than a free proposal.",
      paragraphs: [
        "A scorecard makes that offer defensible, because the result page can say why this project needs a discovery phase in terms of the answers the client just gave. The same page can send a weaker enquiry to a fixed-price starter engagement instead of a bespoke estimate nobody will read.",
      ],
      bullets: [],
    },
  ],
  cta: {
    heading: "Stop estimating projects that do not exist",
    body: "Establish budget, stack and decision process on the enquiry, and spend your senior days on the ones that clear the line.",
  },
};

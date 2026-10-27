import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "surveymonkey-alternative",
  kind: "comparison",
  intent:
    "Someone who reached for a survey tool to screen enquiries and found it answers questions about a population rather than making a decision about one person, and who wants to know what a research platform gives them that a qualification engine does not.",
  primaryKeyword: "surveymonkey alternative",
  secondaryKeywords: [
    "surveymonkey alternative for lead qualification",
    "alternative to surveymonkey for leads",
    "surveymonkey vs assess360",
  ],
  title: "SurveyMonkey Alternative for Lead Qualification",
  description:
    "Assess360 against SurveyMonkey: quiz scoring and bands both do, a gate and ad reporting only one does, and the research tooling only SurveyMonkey has.",
  h1: "Assess360 as a SurveyMonkey alternative",
  shortName: "vs SurveyMonkey",
  factsCheckedOn: "2026-10-27",
  lede:
    "SurveyMonkey can score a quiz and show feedback by score band, so this is not a story about one tool doing maths and the other not. It is about what the tool is shaped for. A research platform stores every response, including the ones it disqualifies, bills you for the ones you delete, and turns its own results page off the moment you add the branching a funnel needs.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "assessment-software", "scorecard"],
  sections: [
    {
      id: "population-vs-person",
      heading: "A population answer, or a decision about one person",
      answer:
        "Survey tools are optimised for analysis after the fact; qualification has to produce a verdict while the respondent is still on the page.",
      paragraphs: [
        "That timing requirement is what drives almost every difference. The score has to be computed instantly, the result has to be shown immediately, and the routing has to happen before the person leaves.",
        "SurveyMonkey can do the first part of that. Quiz mode assigns points to answer choices, and score ranges each carry a label and a message. What it cannot do is combine that with the logic a funnel needs: their own documentation says the quiz results page is disabled automatically when incompatible logic is added, and the incompatible list includes question skip logic, page skip logic, advanced branching, carry-forward and piping. You get the scoring or you get the routing.",
      ],
      bullets: [],
    },
    {
      id: "acting-on-it",
      heading: "Acting on the answer, not reporting it",
      answer:
        "Show the respondent their band, rank them for the sales team, and tell the ad platform the outcome, all before they close the tab.",
      paragraphs: [
        "A survey export can tell you that 40 per cent of enquiries fall below your threshold. It cannot stop the other 60 per cent waiting behind them in the queue, which is the thing that actually costs money.",
        "The metering difference is the one that surprises people. SurveyMonkey stores a disqualified respondent with a Disqualified status, keeps them in your results, and counts them against your limit. All responses count, including the ones you delete, and over the limit they bill at fifteen cents each. Here a disqualifying answer stores nothing at all, so there is nothing to count and nothing to pay for.",
      ],
      bullets: [],
    },
    {
      id: "what-the-ad-account-sees",
      heading: "What your ad account sees, in each case",
      answer: "A survey platform reports nothing. There is no documented pixel, no Conversions API and no Google Ads hook anywhere on their own site.",
      paragraphs: [
        "This is the part that is invisible until somebody goes looking for it. If paid traffic lands on a survey, the optimisation algorithm has nothing to work with beyond the click, and it will go and find more people who click. That is a real population, and it overlaps with your buyers far less than anyone expects.",
        "Reporting qualified completions as their own event changes what the algorithm is chasing. Feeding the disqualified into an exclusion audience changes who it is allowed to chase at all. Neither is something a research tool has any reason to build, which is why it is not a criticism of SurveyMonkey so much as a boundary around what it is for.",
      ],
      bullets: [
        "Disqualified visitors leave no lead record, so nothing reaches your CRM to be cleaned out later",
        "A qualified-only conversion event, so the algorithm optimises toward people who passed rather than people who typed fast",
        "An exclusion audience that grows by itself, so you stop paying to reach the people you just turned away",
      ],
    },
  ],
  parity: {
    intro:
      "A survey tool and a qualification engine overlap more than the framing above suggests, and if what you actually use SurveyMonkey for is asking questions and acting on the answers, this does that too. Plans are named where something is tier-gated.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "freetext",
      "resultPage",
      "pdf",
      "resultLink",
      "redirect",
      "captureOrder",
      "domain",
      "branding",
      "templates",
      "importer",
      "resume",
      "retakes",
      "webhooks",
      "export",
      "submissions",
      "emailSending",
      "stats",
      "utm",
      "seats",
      "unsubscribe",
    ),
  },
  limits: {
    intro:
      "SurveyMonkey is a research platform with twenty years behind it, and most of this list is something it has and we do not. The compliance and accessibility lines in particular are places where it is simply the serious product and we are not.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "aggregate",
      "languages",
      "embeds",
      "abTesting",
      "api",
      "zapier",
      "compliance",
      "accessibility",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "SurveyMonkey",
    source:
      "read from their own pricing pages, help centre and trust centre on 27 October 2026. Their pricing page serves different currencies by region, and their free plan's response cap is not published anywhere on their site",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A disqualifying answer stores no lead, no submission and no result.",
        them: "No. A disqualified respondent is stored with a Disqualified status and appears in your results.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "Every response counts, including partials, disqualified and the ones you delete, at $0.15 each over the limit.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No, and no browser pixel either. Nothing on their own site documents installing a Meta pixel on a survey.",
      },
      {
        label: "Scoring and routing at the same time",
        us: "Yes. Bands, category subscores and answer-based routing all run together.",
        them: "No. Their quiz results page is disabled automatically when skip logic, advanced branching, carry-forward or piping is added.",
      },
      {
        label: "Points per answer",
        us: "Points per option, a weight per question, and a score per category.",
        them: "Points per answer choice in quiz mode, on multiple choice, checkbox, image choice and dropdown. No negative points, no category scores.",
        tie: true,
      },
      {
        label: "Named score bands",
        us: "Named bands, overall and per category, each with its own message and next step.",
        them: "Score or percentage ranges, each with a range label, a message and an optional image. Genuinely equivalent.",
        tie: true,
      },
      {
        label: "Skip logic and branching",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Question and page skip logic plus advanced multi-condition branching, on their annual tiers.",
        tie: true,
      },
      {
        label: "Webhooks and export",
        us: "Signed webhooks with a retry queue, and CSV export on every plan.",
        them: "Webhooks through their v3 API with eight event types, and exports.",
        tie: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, your own domain with the certificate provisioned.",
        them: "A custom subdomain on their own hostname, Enterprise only. There is no bring-your-own domain on any tier.",
      },
      {
        label: "Question types",
        us: "Two: single-select and free text.",
        them: "Twenty-three, including NPS, matrix, ranking, slider, star rating, click map, image choice, file upload and date.",
        themWins: true,
      },
      {
        label: "Analysing a population",
        us: "Nothing. No cross-tabs, no distributions, no significance testing, no panel.",
        them: "Crosstabs, statistical significance, sentiment analysis, quotas, and respondents you can buy from their own audience panel.",
        themWins: true,
      },
      {
        label: "More than one language",
        us: "No. One language per funnel.",
        them: "57 survey languages with translation files, a respondent language picker and right-to-left support.",
        themWins: true,
      },
      {
        label: "Security, compliance and accessibility",
        us: "None. No SOC 2, no ISO, no DPA, no SSO, no accessibility conformance.",
        them: "SOC 2 Type 2, ISO 27001 and 27701, PCI DSS, a published DPA, SSO and HIPAA on Enterprise, WCAG 2.1 AA with a conformance report.",
        themWins: true,
      },
      {
        label: "Entry price and volume",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "A free Basic plan, and Advantage Annual at $39/mo for 15,000 responses a year. Far more volume for the money.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "SurveyMonkey is the right tool whenever the question is about a group rather than a person: market research, employee feedback, customer satisfaction tracked over time, anything you need to cross-tabulate or test for significance, anything that needs a panel of respondents you do not have. It is also the serious choice if procurement needs SOC 2, ISO 27001 or an accessibility conformance report, because we have none of those. Qualification is simply not what it is shaped for, and that is the only ground on which this is the better buy.",
  faqs: [
    {
      q: "Can SurveyMonkey not score a quiz already?",
      a: "It can. Quiz mode puts points on answer choices and score ranges carry labels and messages. The limitation is specific and documented by them: the quiz results page switches off when you add skip logic, advanced branching, carry-forward or piping. A qualification funnel needs the routing and the result, and SurveyMonkey makes you pick one.",
    },
    {
      q: "Does a rejected respondent cost me anything on SurveyMonkey?",
      a: "Yes. Disqualified and partial responses are stored and counted, and their own help centre states that all responses count toward your overage including the ones you delete, billed at fifteen cents each past the limit. Here a disqualifying answer creates no submission, so there is nothing to meter and nothing to delete.",
    },
    {
      q: "What would I lose by moving?",
      a: "Twenty-one question types we do not have, crosstabs and significance testing, the audience panel, 57 languages, the free plan, roughly ten times the responses for the same money, and every piece of compliance paperwork: SOC 2, ISO 27001, the DPA, SSO and HIPAA. If your work is research, or your buyer is a procurement team, none of this is close.",
    },
    {
      q: "Can I move a SurveyMonkey survey across?",
      a: "Single-select and free-text questions move by pasting them into the plain-text importer. NPS, matrix, ranking and sliders have to be rewritten as single-select or dropped. Send us the live link and we will rebuild it as a scored funnel with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Decide, do not survey",
    body: "Build the version that judges one person at a time, routes them, and tells your ad account which ones were worth having.",
  },
};

import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "typeform-alternative",
  kind: "comparison",
  intent:
    "Someone using Typeform as their enquiry or application form who is now reading every submission by hand to decide who is worth a call, and wants that decision made before the submission arrives, while knowing exactly what they would give up by moving.",
  primaryKeyword: "typeform alternative",
  secondaryKeywords: [
    "typeform alternative for lead qualification",
    "alternative to typeform",
    "typeform vs assess360",
  ],
  title: "Typeform Alternative for Lead Qualification",
  description:
    "Assess360 against Typeform: the scoring and logic both do, the gate and server-side conversion only one does, and what Typeform does better.",
  h1: "Assess360 as a Typeform alternative",
  shortName: "vs Typeform",
  factsCheckedOn: "2026-10-27",
  lede:
    "Typeform is one of the best-made form builders there is, and it already scores: points per answer, score and price variables, score ranges that pick an ending. What it will not do is stop a wrong-fit respondent before the record exists, or tell Meta that the person who finished was worth paying for. Its own help centre says the Facebook pixel integration is not compatible with the Conversions API.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "lead-scoring"],
  sections: [
    {
      id: "collect-vs-evaluate",
      heading: "Collecting answers and evaluating them are different jobs",
      answer:
        "Typeform can score. What it cannot do is act on the score before the response is stored, or report the verdict to the platform that sold you the click.",
      paragraphs: [
        "It is worth being precise here, because the lazy version of this comparison claims Typeform cannot score at all, and anyone who has used it knows better. It has score and price variables, per-option values, calculations across variables, score ranges that choose an ending, and two kinds of quiz. The judgement can absolutely be encoded.",
        "What stays true is the timing and the destination. Branching can send a disqualified respondent to a dead-end ending, but the response is recorded either way, it carries an ending column in your export, and it counts against your monthly quota. Deleting it afterwards does not give the quota back.",
      ],
      bullets: [],
    },
    {
      id: "what-you-get",
      heading: "What changes when the answers are scored",
      answer:
        "Wrong-fit respondents can be stopped before they become a record at all, and the right ones arrive already ranked and already reported to your ad account.",
      paragraphs: [
        "The respondent's experience changes too. Instead of a thank-you screen, they get a result that tells them where they stand, which is the thing that makes people answer honestly in the first place.",
      ],
      bullets: [
        "A gate before the opt-in, so a disqualifying answer leaves no lead, no submission and no stored response",
        "Disqualified visitors never count against the plan, because there is nothing stored to count",
        "A weight per question and a score per category, with named bands on the percentage",
        "A qualified-only conversion event sent server-side through the Conversions API",
        "An exclusion signal for everybody turned away, carrying no personal data",
      ],
    },
    {
      id: "when-typeform-wins",
      heading: "When a form is the right tool",
      answer:
        "For surveys, feedback, applications you intend to read individually, anything needing a field type we do not have, and anything that has to be embedded or translated.",
      paragraphs: [
        "If you are not sorting people into better and worse fits, scoring adds nothing, and a well-designed form is the simpler choice. Assess360 earns its place when the volume of enquiries exceeds the hours available to read them.",
        "There is also a plain capability answer. Typeform has file uploads, ranking, matrices, NPS, a scheduler, a signature field, payments, six embed modes and multi-language forms. We have single-select and free text, and a link. If your funnel needs any of those, the comparison is over and Typeform wins it.",
      ],
      bullets: [],
    },
    {
      id: "keeping-both",
      heading: "Most people keep Typeform and move one funnel",
      answer: "This is rarely an all-or-nothing switch, and treating it as one is how it stalls.",
      paragraphs: [
        "The pattern that works is narrow: leave every survey, every feedback form and every internal request where it is, and move only the funnel that paid traffic lands on. That is one form, usually, and it is the one where a wrong-fit submission costs an hour instead of a row in a spreadsheet.",
        "It also makes the comparison honest. Typeform is not losing a competition it was never entered into; it keeps doing the job it is best at, and the one form whose job is to say no moves somewhere built to say it.",
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
      "If you move one funnel across, this is what comes with you. Typeform does all of it too, which is the point: an alternative that could not hold the ordinary work would be an add-on, not a replacement. Where something sits on a particular plan, the line says which.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "resultPage",
      "redirect",
      "resultLink",
      "pdf",
      "aiReport",
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
      "pixel",
      "stats",
      "utm",
      "seats",
      "preview",
    ),
  },
  limits: {
    intro:
      "Typeform is the wider product by a long way, and most of this list is something it does and we do not. Any one of them is a good reason to stay where you are, and we would rather you read it here than find it after rebuilding your funnel.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "embeds",
      "languages",
      "zapier",
      "api",
      "abTesting",
      "questionStats",
      "aiQuestions",
      "esign",
      "stripe",
      "compliance",
      "accessibility",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "Typeform",
    source:
      "read from their own pricing page and help centre on 27 October 2026. Their pricing page shows two different sets of figures, on the plan cards and in the comparison table; the prices here are the card figures, which are the ones consistent with the annual totals they publish",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes, before the opt-in. A failed gate stores no lead, no submission and no result.",
        them: "Branching can route to a disqualifying ending, but the response is stored with an ending column either way.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count against the plan, and previews are unmetered.",
        them: "Every response counts, partials included, and deleting a response does not give the quota back.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No. Their help centre states the Facebook pixel integration is not compatible with the Conversions API.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes. Qualified completions fire their own event, separate from a submission.",
        them: "No. The pixel fires a first-interaction and a submit event, and a submit is a submit.",
      },
      {
        label: "Exclusion audience for the people turned away",
        us: "Yes. Each rejection fires an exclusion event with no personal data in it.",
        them: "No.",
      },
      {
        label: "Points per answer, and logic",
        us: "Points per option, a weight per question, and answer-based skip, jump and cascade.",
        them: "Score and price variables, per-option values, calculations across variables, and a visual logic map.",
        tie: true,
      },
      {
        label: "Score ranges choosing a different outcome",
        us: "Named bands on the percentage, overall and per category, with overlaps refused at save time.",
        them: "Score ranges per ending, plus outcome and match quizzes. More ways to do it than we have.",
        tie: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, with the certificate provisioned.",
        them: "A typeform.com subdomain from Plus. A real custom domain is Enterprise or Growth Custom, at quoted pricing.",
      },
      {
        label: "Branding removed",
        us: "Yes, from $79/mo.",
        them: "Yes, from Plus at $79/mo, although the favicon on hosted forms stays.",
        tie: true,
      },
      {
        label: "Webhooks and CSV export",
        us: "Signed webhooks with a retry queue, and export on every plan including the entry one.",
        them: "Per-form webhooks on every plan, and exports. Fine on both sides.",
        tie: true,
      },
      {
        label: "Field types",
        us: "Two: single-select and free text.",
        them: "Twenty-plus, including file upload, ranking, matrix, NPS, date, address, scheduler, signature and payment.",
        themWins: true,
      },
      {
        label: "Embed in a page you already have",
        us: "No. The funnel is a hosted page on your own domain, distributed as a link.",
        them: "Six modes: inline, full page, popup, slider, popover and side tab, with embed libraries.",
        themWins: true,
      },
      {
        label: "More than one language",
        us: "No. One language per funnel.",
        them: "Multi-language forms with manual or AI translation, from Business.",
        themWins: true,
      },
      {
        label: "Per-question drop-off",
        us: "No. Stats are per stage, so you never learn which screen lost somebody.",
        them: "Question-by-question views and drop-off, from Business.",
        themWins: true,
      },
      {
        label: "API, Zapier and CRM connectors",
        us: "Two read endpoints on Agency, $249. No Zapier app, no named CRM connector.",
        them: "A public create, responses and webhooks API, Zapier and Make, HubSpot, Salesforce, Pipedrive and more.",
        themWins: true,
      },
      {
        label: "Security and compliance paperwork",
        us: "None. No SOC 2, no ISO, no BAA, no DPA, no SSO.",
        them: "SOC 2 Type II, ISO 27001, a published DPA, SSO on Enterprise, and a BAA on their top tiers.",
        themWins: true,
      },
      {
        label: "Free plan and entry price",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "A free plan with 10 responses a month, then Basic at $39/mo for 100 responses, or $28/mo billed annually.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Typeform is the better buy whenever the form itself is the product. If you need file uploads, a signature, a matrix, NPS, a scheduler, payments, six ways to embed, or the same form in four languages, it has all of that and we have none of it. It is also the right answer if your procurement needs SOC 2 or a DPA, or if you simply want a free plan to park a form on. Choose Assess360 only when the job is turning people away and reporting that to an ad account.",
  faqs: [
    {
      q: "Can Typeform not already score answers?",
      a: "It can, and anyone telling you otherwise has not used it. Per-option values, score variables, calculations and score ranges that pick an ending are all there. The difference is not arithmetic, it is what happens around it: the gate runs before any contact detail is asked, so a wrong-fit respondent leaves no record and costs no quota, and the completion that does happen is reported to Meta as a qualified event with everybody else going into an exclusion audience.",
    },
    {
      q: "Does Typeform support the Conversions API?",
      a: "No. Their own help centre states the Facebook pixel integration is currently not compatible with the Conversions API, and no server-side option is documented. For a funnel behind paid traffic that means the conversion signal is a browser pixel, which also stops firing its Typeform events if you install the pixel through Tag Manager. That is the single most consequential gap for anybody buying ads.",
    },
    {
      q: "What would I lose by moving?",
      a: "File uploads, ranking, matrix, NPS, date and signature questions, payments, every embed mode, multi-language, question-by-question drop-off, the public API, Zapier and Make, the native CRM connectors, SOC 2 and the DPA, and the free plan. We have two question types and a link. If that list contains something your funnel needs, stay.",
    },
    {
      q: "Can I move my Typeform across?",
      a: "The questions move if they are single-select or free text, by pasting them into the plain-text importer. Anything else has to be rewritten as a single-select or dropped. The gate is new, because Typeform has nowhere to put one. Send us your live link and we will rebuild it with a gate in front of it, free, and take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Score the form you already have",
    body: "Move one funnel, keep the rest where it is, and see what a gate and a qualified-only event do to the calls that follow.",
  },
};

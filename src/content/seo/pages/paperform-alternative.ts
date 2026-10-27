import type { SeoPage } from "@/lib/seo/types";
import { caps, lacks } from "../capabilities";

export const page: SeoPage = {
  slug: "paperform-alternative",
  kind: "comparison",
  intent:
    "Someone using Paperform for enquiry and booking forms who wants the enquiry judged against fit criteria before it reaches a calendar or an inbox, and who needs to know what Paperform's calculation engine and bundled e-signature were worth to them.",
  primaryKeyword: "paperform alternative",
  secondaryKeywords: [
    "paperform alternative for lead qualification",
    "alternative to paperform",
    "paperform vs assess360",
  ],
  title: "Paperform Alternative for Lead Qualification",
  description:
    "Assess360 against Paperform: both score and route, only one gates before the opt-in and reports a server-side qualified event, and Paperform bundles e-signature.",
  h1: "Assess360 as a Paperform alternative",
  shortName: "vs Paperform",
  factsCheckedOn: "2026-10-27",
  lede:
    "Paperform makes a form feel like a page, and it scores properly: built-in scoring with per-answer values, a calculation field with formulas, and dynamic success pages chosen by the result. Two things it does not do are stop a wrong-fit respondent before a record exists, and report a qualified completion to Meta from the server.",
  updatedAt: "2026-10-27",
  internalLinks: ["lead-qualification-software", "qualify-leads-before-sales-call", "scorecard"],
  sections: [
    {
      id: "booking",
      heading: "A booking taken is harder to undo than a booking prevented",
      answer:
        "Once an unqualified enquiry holds a slot, somebody has to either sit through it or take it back, and both cost more than a screening question would have.",
      paragraphs: [
        "Putting qualification ahead of the booking step changes the economics of the whole funnel: the calendar stops being first come, first served and starts reflecting who can actually buy.",
        "Paperform can hide pages with logic, but its own documentation describes no early exit or disqualification, and a partial submission is recorded about five seconds after the first answer. So by the time your logic has worked out that this person is wrong, there is already a row with their name on it.",
      ],
      bullets: [],
    },
    {
      id: "what-it-adds",
      heading: "What scoring adds to a well-made form",
      answer:
        "Not the arithmetic, which Paperform already has, but a band structure instead of hand-built conditions, and a signal for the ad platform.",
      paragraphs: [
        "It is worth being specific about what Paperform's scoring cannot reach, because it is not the obvious thing. Their own help centre documents the ceilings: a calculation result cannot be used inside another calculation, the score variable cannot be used inside a calculation at all, and dynamic success pages need you to cover the boundary values yourself, so a score of exactly ten can fall between less-than-ten and more-than-ten. Category subscores are one IF-formula calculation field per section.",
        "Here the weights, the per-category scores and the bands are configured fields with overlap validation, and the result is picked for you. That is the whole of the difference on scoring, and it is a difference of maintenance rather than of capability.",
      ],
      bullets: [
        "A weight per question and a score per category, with named bands validated against overlaps",
        "A gate before the opt-in, so a rejection creates no record and no partial submission",
        "A result page that differs by band",
        "Qualified-only conversion events sent server-side on the $39 plan",
      ],
    },
    {
      id: "beautiful-is-not-the-constraint",
      heading: "When how the form looks stops being the constraint",
      answer: "Paperform wins on the writing experience, and it bundles an e-signature product. That stops mattering when the problem is who is filling it in.",
      paragraphs: [
        "There is a point in most funnels where the form is already good enough and the bottleneck has moved. Nobody is losing deals because the form was not elegant; they are losing time because the enquiries arriving through it are indistinguishable until somebody gets on a call.",
        "That is the moment the question changes from how this form reads to what it refuses, and it is the only moment this product is the better answer. Everything else on Paperform's sheet, twenty-seven field types, Papersign on every tier, four payment gateways, unlimited submissions on Pro, is still there and still better than ours.",
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
      "The form work moves across. Paperform does all of this too, and on the scoring lines its engine is more flexible than ours; what the list is for is showing that nothing ordinary breaks when you leave. Plans are named where something is tier-gated.",
    items: caps(
      "points",
      "weights",
      "bands",
      "logic",
      "pacing",
      "resultPage",
      "pdf",
      "resultLink",
      "redirect",
      "payments",
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
    ),
  },
  limits: {
    intro:
      "Paperform is the wider product and, on submissions, the far cheaper one. Most of this list is something it has and we do not, and the unlimited-submissions Pro plan is the line that should give you most pause.",
    items: lacks(
      "questionTypes",
      "fileUpload",
      "esign",
      "stripe",
      "embeds",
      "prefill",
      "zapier",
      "api",
      "abTesting",
      "aiQuestions",
      "compliance",
      "accessibility",
      "freePlan",
      "volume",
      "annual",
    ),
  },
  comparison: {
    competitor: "Paperform",
    source:
      "read from their own pricing page and help centre on 27 October 2026. Their pricing FAQ and comparison table disagree about whether the Pro plan includes a custom domain, so treat that line as worth checking with them",
    rows: [
      {
        label: "Gate runs before the opt-in",
        us: "Yes. A failed gate stores no lead, no submission and no partial record at all.",
        them: "No early exit is documented, and a partial submission is recorded roughly five seconds after the first answer.",
      },
      {
        label: "Are disqualified visitors metered?",
        us: "Never. Only qualified completions count, and previews are unmetered.",
        them: "Not documented. Partials are kept for 30 days on a rolling basis, and nothing states whether they count.",
      },
      {
        label: "Server-side Conversions API",
        us: "Yes, on every paid plan including the $39 one, deduplicated against the browser pixel.",
        them: "No. Their analytics docs cover a Facebook Pixel ID and mention no Conversions API, access token or dataset.",
      },
      {
        label: "Qualified-only conversion event",
        us: "Yes, as its own event, with an exclusion signal for everybody turned away.",
        them: "No. The pixel reports form activity; a submission is a submission.",
      },
      {
        label: "Scoring: bands, or conditions you maintain",
        us: "A weight per question, a score per category, and named bands with overlaps refused at save time.",
        them: "Built-in scoring and a calculation field with formulas, but bands are manual comparisons and their docs warn you to cover the boundary values yourself.",
      },
      {
        label: "Calculations",
        us: "None beyond scoring. No formula field.",
        them: "A calculation field with formulas and arrays, plus an AI assistant that writes the formula from plain language.",
        themWins: true,
      },
      {
        label: "More than one outcome page",
        us: "Yes, with band-specific content inside the page.",
        them: "Yes, dynamic success pages with conditions, resolved by priority.",
        tie: true,
      },
      {
        label: "Conditional logic",
        us: "Answer-based skip, jump, converge and cascade into a different assessment.",
        them: "Visibility logic on questions, sections and pages, with condition groups, on every plan including free.",
        tie: true,
      },
      {
        label: "Custom PDF",
        us: "Yes, on every paid plan, for your team. A respondent cannot fetch their own.",
        them: "Yes, custom PDFs attachable to emails, so the respondent gets one.",
        themWins: true,
      },
      {
        label: "Custom domain",
        us: "Yes, from $79/mo, with the certificate provisioned.",
        them: "An extra $20/mo on Pro, or one included on Business at $124/mo. Their own FAQ and table disagree.",
        tie: true,
      },
      {
        label: "Webhooks and export",
        us: "Signed webhooks with a durable retry queue, and CSV export on every plan.",
        them: "Webhooks on Pro and above, firing on submissions and on new partials.",
        tie: true,
      },
      {
        label: "Field types",
        us: "Two: single-select and free text.",
        them: "Twenty-seven, including file upload, signature, matrix, rating, scale, slider, rank, address, appointment and products.",
        themWins: true,
      },
      {
        label: "E-signature",
        us: "None. Nothing to sign.",
        them: "Papersign, a whole signing product, bundled with every tier including free.",
        themWins: true,
      },
      {
        label: "Payments",
        us: "Razorpay, in rupees, only.",
        them: "Stripe, Square, Braintree and PayPal, with products, quantities, subscriptions and coupons.",
        themWins: true,
      },
      {
        label: "API, Zapier and integrations",
        us: "Two read endpoints on Agency, $249. No Zapier app, no named CRM connector.",
        them: "A REST API from Pro, Zapier and Make, and HubSpot, Zoho, Keap, Mailchimp, Klaviyo and more.",
        themWins: true,
      },
      {
        label: "Compliance paperwork",
        us: "None. No SOC 2, no DPA, no SSO, and no HIPAA.",
        them: "SOC 2 Type II, data processing terms, a subprocessor list and SSO on Business. They state plainly that they are not HIPAA compliant either.",
        themWins: true,
      },
      {
        label: "Entry price and volume",
        us: "No free plan. 14 days of the full product, then $39/mo for 150 qualified responses, billed monthly.",
        them: "Free with 30 submissions a month, then Pro at $49/mo billed annually with unlimited submissions under fair use.",
        themWins: true,
      },
    ],
  },
  betterWhen:
    "Paperform is the better buy whenever the form is the deliverable. Twenty-seven field types, a formula engine with an AI writing the formulas, Papersign bundled on every tier, four payment gateways with real e-commerce, unlimited submissions on a forty-nine dollar plan, SOC 2 and a DPA. If you are not buying ads, or a wrong-fit enquiry costs you nothing but a row, it wins outright. Move only when the job of the form is to refuse people and to teach an ad account who to stop chasing.",
  faqs: [
    {
      q: "Paperform already has scoring and dynamic success pages. What is different?",
      a: "On arithmetic, very little, and in places theirs reaches further. What differs is the gate running before any contact field, so a wrong-fit visitor leaves no partial record, and the qualified completion going to Meta server-side as its own event with the rest feeding an exclusion audience. Their scoring also has documented ceilings worth knowing: a calculation cannot feed another calculation, the score variable cannot be used inside a calculation, and you cover the band boundaries yourself.",
    },
    {
      q: "Does Paperform report conversions to Meta?",
      a: "Through a browser pixel on any paid plan, yes. There is no Conversions API, no access token and no dataset in their analytics documentation, so there is no server-side signal. For paid traffic that means the conversion report depends on the browser, and a blocked pixel is a conversion that never happened as far as the algorithm is concerned.",
    },
    {
      q: "What would I lose by moving?",
      a: "Twenty-five field types, file uploads, Papersign, four payment gateways and real e-commerce, the formula engine, URL prefill and hidden fields, the embed modes, the REST API, Zapier and Make, the integrations, SOC 2 and the DPA, and unlimited submissions for forty-nine dollars. That is most of a product, and we would rather say so.",
    },
    {
      q: "Can I move my Paperform across?",
      a: "Single-select and free-text questions move by pasting them into the plain-text importer. Calculations, matrices, ratings, uploads and signature fields do not. Send us the live link and we will rebuild it as a scored funnel with a gate in front of it, free, then take it live with you on one 30-minute call.",
    },
  ],
  cta: {
    heading: "Qualify before the calendar",
    body: "Put a gate in front of the form that feeds your calendar, and let the ad account learn which bookings were worth taking.",
  },
};

import type { Capability } from "@/lib/seo/types";

/**
 * THE TWO LISTS EVERY COMPARISON PAGE DRAWS FROM: what this product does, and what it
 * does not.
 *
 * Why one shared file rather than thirteen hand-written versions.
 *
 * The comparison pages were written one at a time, and every one of them made the same
 * argument - here is the thing we do that they do not - because that is the argument the
 * page's own shape invited. Read by the person it is aimed at, somebody already paying
 * for the other tool, that argument answers a question they did not ask. Theirs is "if I
 * move, what stops working", and a page that never answers it is selling an add-on they
 * would run ALONGSIDE what they have rather than a replacement.
 *
 * Fixing that means every page listing the ordinary capabilities too, and the moment the
 * same twenty-five claims are written thirteen times by hand, three of them are wrong
 * within a month. That is not hypothetical: the pages this file replaced claimed
 * "weighted category scoring" in all thirteen comparison tables, and there is no such
 * thing in the schema - weights are per question. One wrong sentence, copied twelve
 * times, is the failure mode this file exists to prevent.
 *
 * 🔴 THE RULES FOR EDITING THIS FILE
 *
 *  1. CAPS is what a customer can use TODAY, on a named plan. Not what is built, not
 *     what is on staging, not what a release switch is holding back. Eight finished
 *     features are currently held back from every customer by a global switch that
 *     defaults to off (lib/features/catalog.ts): WhatsApp, automations, workflows, the
 *     appointment calendar, contacts, broadcasts, gate-result display and lifecycle
 *     nurture. None of them may appear in CAPS while that is true.
 *  2. Every entry names its plan when the feature is tier-gated, because "yes we do
 *     that" followed by a $79 wall on signup is the same as a lie, only later.
 *  3. Every entry is checked against the code, not against our own marketing. The
 *     marketing copy is the thing being audited, never the evidence.
 *  4. LACKS is written plainly, in the words a buyer would use, with no softening. A
 *     reader who discovers an absence we did not admit stops believing the rows they
 *     cannot check, which is most of them.
 *  5. When a feature ships, it moves from LACKS to CAPS in the same commit. A stale
 *     absence is as damaging as a false claim: it talks a buyer out of a sale we could
 *     have made.
 *
 * Both maps are keyed, and pages pick a subset by key, so a page is a selection from a
 * checked list rather than a fresh piece of prose each time.
 *
 * Audited against the schema, the plan catalog and the implementing code on 27-10-2026.
 */

/** What Assess360 does. The matched half of every comparison. */
export const CAPS = {
  // ---- The scorecard itself ------------------------------------------------
  points: {
    label: "Points per answer",
    detail:
      "Every answer option carries the score you give it, and a question can be left out of the scoring entirely. Every paid plan.",
  },
  weights: {
    label: "A weight per question, subscores per category",
    detail:
      "Each question carries its own weight, and each category reports its own score with its own named bands beside the overall one. Bands match on the percentage, so a skipped optional question does not distort the result.",
  },
  bands: {
    label: "Named result bands",
    detail:
      "Scores map to bands you name, each with its own message and its own next step, overall and per category, with overlaps refused at save time. Every paid plan.",
  },
  logic: {
    label: "Conditional logic",
    detail:
      "Skip or jump by answer, converge branches on a default route, and send a respondent into a different assessment altogether. Needs the one-question-per-page mode, which is where the rules are read.",
  },
  pacing: {
    label: "One question per page, or all of them",
    detail:
      "Three display modes: the whole thing on one page, a page per category, or one question at a time with its category named and a step counter.",
  },
  freetext: {
    label: "Free-text screening questions",
    detail:
      "Typed answers like company, website and what the business does are stored unscored, with each submission, for you to read before the call. Signal, $79.",
  },
  resume: {
    label: "Answers survive a closed tab",
    detail:
      "Answers autosave as they are given, and somebody who comes back and re-enters their email picks the run up where they left it rather than starting again.",
  },
  retakes: {
    label: "Retake rules",
    detail:
      "Unlimited, blocked for a set number of days, or once ever, keyed on email or mobile, with the back button locked for a visitor who was turned away.",
  },
  templates: {
    label: "Twenty-four templates to start from",
    detail:
      "Finished scorecards for different trades that you import and edit, so the first one does not start on a blank page.",
  },
  importer: {
    label: "Paste your questions in",
    detail:
      "A plain-text importer builds the whole thing, categories, questions, options and bands, from a list you paste, with a preview before it saves. Every plan.",
  },

  // ---- What the respondent gets -------------------------------------------
  resultPage: {
    label: "Two result-page builders",
    detail:
      "A results page assembled from blocks that include the band, a per-band sentence and the category scores, or a long-form page with a headline, video, testimonials and buttons. Edited as a draft, published as a snapshot.",
  },
  pdf: {
    label: "Branded PDF report",
    detail:
      "Every scored result renders as a branded PDF, built from the stored snapshot so it never changes under you. Every paid plan. It is for your team: a respondent cannot fetch their own.",
  },
  resultLink: {
    label: "The result by email, as a link",
    detail:
      "One email, or an approved WhatsApp template, fires on opt-in and can carry that person's own result link. Somebody who returns can have their previous result sent again.",
  },
  aiReport: {
    label: "AI-written report",
    detail:
      "Connect your own OpenAI, Claude or Gemini key and the result page carries a statement written for that person's answers, versioned, with a manual override. Signal, $79.",
  },
  redirect: {
    label: "Send them somewhere afterwards",
    detail:
      "Show the result here, or redirect to your own page with a signed token so the destination knows who arrived and what they scored.",
  },
  payments: {
    label: "Take the payment in the funnel",
    detail:
      "A paid step inside the flow, or a link you send by hand where the client types the amount. Razorpay, in rupees.",
  },

  // ---- Lead capture and distribution --------------------------------------
  captureOrder: {
    label: "Where the opt-in sits",
    detail:
      "Before the questions or after them, with each field's label, collection and requiredness set separately, plus a split mode that takes the name first and the phone number last.",
  },
  utm: {
    label: "Attribution captured on arrival",
    detail:
      "Every UTM parameter, plus fbclid and gclid, is taken from the landing URL and kept on the response, the page view and the rejection, with a breakdown report by source.",
  },
  domain: {
    label: "Your own domain",
    detail:
      "The whole funnel on your domain, certificate provisioned, with the DNS records shown for you to add. Signal, $79. One domain per workspace, further ones $5 each.",
  },
  branding: {
    label: "Your branding, ours gone",
    detail: "Your colours and logo, and the Assess360 badge removed from the public funnel. Signal, $79.",
  },
  mobile: {
    label: "Built for a phone first",
    detail:
      "Every screen is laid out for a phone before a desktop, which is where almost all ad traffic arrives.",
  },

  // ---- Where the data goes -------------------------------------------------
  webhooks: {
    label: "Signed webhooks that do not drop",
    detail:
      "HMAC-signed JSON to as many endpoints as you like, per event, with a log of every attempt and a durable retry queue that replays a failure byte for byte. Every paid plan.",
  },
  export: {
    label: "CSV export, never gated",
    detail:
      "Submissions, contacts, stats and the page-view log all export as CSV on every plan, including the entry one. Export is deliberately not a paid feature: it is your data.",
  },
  submissions: {
    label: "A submissions table you can actually search",
    detail:
      "One row per response with the lead fields, score, band, category scores, events fired and payment state, searchable across the whole table, with the result page and PDF one click away.",
  },
  emailSending: {
    label: "Email on your own account",
    detail:
      "Ten transports: ZeptoMail India or Global, Resend, Brevo, SendGrid, Postmark, Mailgun US or EU, SMTP2GO, or your own SMTP server, with your credentials, per workspace.",
  },
  pixel: {
    label: "Meta Pixel and the Conversions API",
    detail:
      "Browser and server events, deduplicated against each other, hashed match keys, a full log of every payload and Meta's reply, and separate credentials per ad account. Every paid plan, including the $39 one.",
  },
  stats: {
    label: "Funnel stats, with the crawlers taken out",
    detail:
      "Views, unique visitors, gate passed, turned away by route, opt-ins, completions and payments, per funnel and per date range, with ad-review bots detected and kept out of the numbers rather than counted as traffic.",
  },
  heatmap: {
    label: "Heatmap and session recording",
    detail:
      "Paste your Clarity snippet, or any other, per workspace or per funnel. Signal, $79.",
  },
  unsubscribe: {
    label: "A working way out",
    detail:
      "Consent text is stamped on the contact exactly as it was shown, and unsubscribe links are real and honoured by everything that sends.",
  },

  // ---- The account ---------------------------------------------------------
  seats: {
    label: "Teammates with view or edit access",
    detail:
      "Invite people read-only or able to edit, never able to manage staff. One seat on Gate, three on Signal.",
  },
  workspaces: {
    label: "A separate workspace per client",
    detail:
      "Agency, $249: your own workspace plus five for the people who hire you, each with its own login, domain, pixel, Razorpay account and webhooks, all run from your one login. Further ones $29 each.",
  },
  preview: {
    label: "Previewing is free",
    detail:
      "A preview run does everything except fire a conversion or count against your plan, so testing a funnel properly costs nothing and never pollutes the ad account.",
  },
} as const satisfies Record<string, Capability>;

export type CapKey = keyof typeof CAPS;

/**
 * What Assess360 does NOT do.
 *
 * Written to be read by somebody who is about to find out anyway. The two question types
 * and the entry-tier volume lose the most deals, so they go first wherever they are
 * relevant rather than being buried at the end of a list.
 */
export const LACKS = {
  questionTypes: {
    label: "Two kinds of question, and that is all",
    detail:
      "A single-select that scores, and free text that does not. There is no multi-select, rating scale, NPS, slider, matrix, date picker, number field, ranking, dropdown or image choice, and no image or video on a question. A scorecard that needs a 0-to-10 scale or a tick-all-that-apply cannot be built here today.",
  },
  fileUpload: {
    label: "A respondent cannot upload anything",
    detail:
      "No file, no image, no document, no CV. Any intake that needs an attachment, or a photo of the thing being assessed, is out.",
  },
  embeds: {
    label: "No embed",
    detail:
      "A funnel is a hosted page on your own domain, distributed as a link. There is no inline widget, popup, slide-in, chat-style window, iframe snippet or WordPress shortcode, so a quiz that has to live inside an article you already have is the wrong fit.",
  },
  languages: {
    label: "One language per funnel",
    detail:
      "There is no translation layer and no language switcher. A second language means a second funnel, built and scored again by hand.",
  },
  zapier: {
    label: "No Zapier or Make app, and no named CRM connector",
    detail:
      "Integration is a signed webhook pointed at an endpoint you own, which can be a Zapier catch hook you build yourself. There is no listed app in either directory, and no one-click connector for HubSpot, Salesforce, Pipedrive, Mailchimp or anything else. No Google Sheets, no Slack, no SMS.",
  },
  api: {
    label: "The API is two read endpoints, on Agency",
    detail:
      "There is no public API on the $39 or $79 plans, and what arrives on Agency at $249 is read-only: match keys for an external conversions sender, and a results read. There is no endpoint to create an assessment, list submissions or write a result, and our own API docs say so.",
  },
  aiQuestions: {
    label: "AI does not write the questions",
    detail:
      "The importer parses a list you paste and calls no model. The AI writes the report at the end, not the scorecard, so the first draft of the questions is yours.",
  },
  googleAds: {
    label: "Meta, and nothing else",
    detail:
      "No Google Ads conversion import, no GA4, no Tag Manager, and no TikTok, LinkedIn, Snap or Pinterest pixel. The gclid is captured and stored but nothing is ever sent to Google. If you buy traffic anywhere but Meta, the measurement half of this product does nothing for you.",
  },
  abTesting: {
    label: "No A/B testing, and no randomisation",
    detail:
      "You cannot publish two versions behind one link and have the split and the reporting handled for you. There is also no question or option randomisation, no answer piping into later questions, and no time limit on a quiz or a question.",
  },
  questionStats: {
    label: "No per-question statistics, and no step drop-off",
    detail:
      "Stats are per stage: viewed, passed the gate, opted in, completed, turned away and by which route. Nothing records which screen somebody abandoned on, and there is no distribution of answers to a single question across respondents.",
  },
  aggregate: {
    label: "Not a research tool",
    detail:
      "No cross-tabulation, no aggregate distributions, no significance testing and no respondent panel to buy. It judges one person at a time, which is the opposite shape to a survey.",
  },
  prefill: {
    label: "No hidden fields, no URL prefill",
    detail:
      "You cannot pass a value in on the link and have it ride along on the response, and you cannot open a funnel with the email already filled. Attribution is captured automatically, but it is not something you can add fields to.",
  },
  esign: {
    label: "No signature, no offline mode",
    detail:
      "Nothing for a respondent to sign, and no kiosk or offline capture. Every response needs a live connection to the server.",
  },
  compliance: {
    label: "A low compliance floor, stated plainly",
    detail:
      "No SOC 2, no ISO 27001, no HIPAA or BAA, no DPA or sub-processor list, no choice of data region, no SSO or SAML, no two-factor login, no audit log of who changed what, and no CAPTCHA. The privacy policy is written to India's DPDP rather than to GDPR. If your procurement process asks for any of that, this fails the check today.",
  },
  accessibility: {
    label: "No accessibility conformance",
    detail:
      "There is no WCAG audit, no conformance statement and no accessibility testing in the build. Public-sector or enterprise buyers who require one should not take our word for it, because there is nothing to take.",
  },
  stripe: {
    label: "Razorpay and rupees only",
    detail:
      "The payment step inside a funnel charges in INR through Razorpay. No Stripe, no PayPal, no Square, no other currency. If you collect money outside India you would take it somewhere else.",
  },
  freePlan: {
    label: "No free plan",
    detail:
      "Fourteen days of the full product with no card, after which the account parks read-only and nothing is deleted. There is no permanently free tier to leave a funnel sitting on.",
  },
  annual: {
    label: "Annual billing is not buyable yet",
    detail:
      "Annual per-month prices are published, but every subscription the system creates is monthly in USD, and there is no yearly option at checkout. Budget on the monthly figure.",
  },
  volume: {
    label: "Small response allowances",
    detail:
      "150 qualified responses a month at $39 and 1,000 at $79, where tools priced for list growth give you several thousand for similar money. Nothing is ever rejected over the cap, but completions past it are held back, including from your export, until the plan is raised.",
  },
  followUp: {
    label: "The follow-up half is still being released",
    detail:
      "Contacts, automations, multi-step sequences, broadcasts, WhatsApp sending and the appointment calendar are built and behind a release switch that is off, so they reach nobody today. Treat them as arriving, not as something you are buying.",
  },
} as const satisfies Record<string, Capability>;

export type LackKey = keyof typeof LACKS;

/** Pick parity items by key, in the order given. Order is editorial, so it is explicit. */
export function caps(...keys: readonly CapKey[]): Capability[] {
  return keys.map((k) => CAPS[k]);
}

/** Pick admitted absences by key, in the order given. */
export function lacks(...keys: readonly LackKey[]): Capability[] {
  return keys.map((k) => LACKS[k]);
}

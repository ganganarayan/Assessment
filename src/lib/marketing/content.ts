// ============================================================================
//  Marketing landing content - the single place to edit copy, prices, and FAQ.
//  Rendered only on the platform root domain (assess360.divineleads.guru).
// ============================================================================

export const MARKETING = {
  name: "Assess360",
  // Public URL of the marketing home (used for canonical + JSON-LD).
  domain: "https://assess360.divineleads.guru",
  // Internal links - same domain, same service.
  signupHref: "/sign-up",
  signinHref: "/sign-in",
  heroImage: "/hero-scorecard.png",
  // NOTE: no ogImage key. The share card is GENERATED at /opengraph-image (see
  // app/opengraph-image.tsx) and injected into every route by Next's file convention,
  // so there is no static file to keep in sync - and no path that can 404 the way
  // /og-image.png did for as long as it was referenced here without ever existing.
  title: "Assess360 - Qualify leads before the sales call",
  description:
    "Assess360 scores every prospect against your fit criteria, so your team only talks to the leads that are actually ready to buy.",
} as const;

export const NAV_LINKS: ReadonlyArray<{ label: string; href: string }> = [
  { label: "How it works", href: "#how" },
  { label: "Capabilities", href: "#capabilities" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
];

export const STEPS: ReadonlyArray<{ n: string; title: string; body: string }> = [
  {
    n: "01",
    title: "Build the scorecard",
    body: 'Define your dimensions, weight what matters, and set the score that means "qualified."',
  },
  {
    n: "02",
    title: "Share the link",
    body: "Send one hosted link - in email, ads, or on your site. No embed, no re-hosting.",
  },
  {
    n: "03",
    title: "Score & route the leads",
    body: "Every response is scored instantly and routed by fit, so sales sees the ready ones first.",
  },
];

export type Capability = { title: string; body: string; soon?: boolean };

export const CAPABILITIES: ReadonlyArray<Capability> = [
  {
    title: "Weighted scoring engine",
    body: "Assign points per answer and weight each category, so the final score reflects real fit - not just completion.",
  },
  {
    title: "Conditional logic & branching",
    body: "Route each respondent by their answers - skip or jump questions so everyone gets the shortest relevant path to their score.",
  },
  {
    title: "Pre-assessment qualification gate",
    body: "Screen every visitor before the assessment even starts. Unfit traffic - wrong role, size, or intent - is routed to a separate exit page with no lead, no result and nothing stored, so your pipeline only fills with people who actually fit.",
  },
  {
    title: "Manual-review screening questions",
    body: "Add free-text questions - company name, website, what the business does - captured with each qualified lead, so you can eyeball the ones who slip through and disqualify fakers by hand.",
  },
  {
    title: "Repeat & back-button protection",
    body: "A rejected visitor can't refresh, back-button, or return to sneak a second attempt at the gate - they're re-locked to the exit page instantly.",
  },
  {
    title: "Dynamic result pages",
    body: "Every respondent gets a personalized, hosted result: their score, their strengths, and a clear next step.",
  },
  {
    title: "AI question generation",
    body: "Generate a first draft of your questions and answer options with AI, then edit - a full scorecard in minutes.",
  },
  {
    title: "AI-written result reports",
    body: "Connect your own OpenAI, Claude, or Gemini key and let it write a short, personalized report for each respondent.",
  },
  {
    title: "Result interpretation & bands",
    body: "Map scores to named bands, each with its own tailored message and recommended next step.",
  },
  {
    title: "Meta Pixel + Conversions API",
    body: "Fire browser and server-side lead and purchase events to Meta - Pixel plus the Conversions API, deduplicated - so your ad optimization learns from real outcomes.",
  },
  {
    title: "Audience exclusion + retargeting on autopilot",
    body: "Disqualify at the door and let Meta learn. The moment a visitor fails your gate, the Conversions API fires an exclusion signal that builds a “never show again” audience; every qualified lead fires a retargeting signal that builds your warm audience. Add both to every campaign and the loop compounds - a disqualified lead never sees your ad again, and the ones who fit flow straight into the funnel.",
  },
  {
    title: "Qualified-only optimization signal",
    body: "Gated funnels report a distinct qualified-completion event to Meta, so the algorithm optimizes toward people who actually pass your bar - not toward form-fillers - while your legacy events stay untouched.",
  },
  {
    title: "Auto-exclude the unqualified",
    body: "Every disqualified visitor fires a custom exclusion event. Build one Meta audience from it and stop paying to show your ad to people who will never qualify.",
  },
  {
    title: "First-party match keys",
    body: "A durable first-party ID rides along on every Pixel and Conversions API event - including your external CRM sends - lifting Meta match quality and attribution without collecting any extra personal data.",
  },
  {
    title: "Heatmap & session recording",
    body: "Drop in your Microsoft Clarity (or any heatmap / recording) snippet - per workspace or per assessment - and see exactly how respondents move through the funnel.",
  },
  {
    title: "Branded PDF reports",
    body: "Turn each scored result into a clean, branded PDF your respondents can download and your team can keep.",
  },
  {
    title: "Lead export & integrations",
    body: "Push each scored lead to your CRM by webhook, or export clean CSVs whenever you need them.",
  },
  {
    title: "Custom domain & branding",
    body: "Run the whole experience on your own domain, in your own brand colors and logo.",
  },
  {
    title: "Team roles & access",
    body: "Invite teammates into your workspace, with edit permissions you control.",
  },
];

export const USE_CASES: ReadonlyArray<{ tag: string; body: string }> = [
  {
    tag: "B2B service firms",
    body: 'Replace the "quick intro call" with a scorecard that confirms fit before anyone books time on the calendar.',
  },
  {
    tag: "Lead-gen & performance agencies",
    body: "Turn cold ad traffic into scored, sales-ready leads your clients can act on the same day.",
  },
  {
    tag: "Consultants qualifying fit",
    body: "Screen inbound interest against your ideal engagement, and open every call already knowing the answer.",
  },
];

export type Tier = {
  name: string;
  /** Monthly price, as displayed. */
  price: string;
  /** Annual price PER MONTH, billed yearly. Null = custom/quoted. */
  annual: string | null;
  period: string;
  blurb: string;
  features: ReadonlyArray<string>;
  cta: string;
  highlight?: boolean;
  badge?: string;
  /** Numeric monthly price for JSON-LD Offers. Null = custom. */
  amount: number | null;
};

/**
 * USD everywhere, no geo-detection. Display only - checkout happens inside the app.
 *
 * NO FREE TIER, BY DECISION. A free plan on a lead-qualification tool attracts exactly
 * the accounts that never qualify anyone, and it puts the differentiator behind a
 * paywall the people evaluating it never cross. A 14-day trial of Signal (no card) puts
 * the full mechanism in their hands instead, and at day 15 the account parks read-only:
 * the scorecard pauses, the data stays. Nothing is deleted, so nobody is punished for
 * evaluating slowly.
 *
 * THE LINE THAT SELLS IT: disqualified visitors are unmetered. Every competitor meters
 * raw submissions - ScoreApp counts every completion against the cap. We count only the
 * ones that passed the gate. That is not a pricing trick: a rejection stores no lead and
 * no result, so there is nothing to meter.
 */
export const TIERS: ReadonlyArray<Tier> = [
  {
    name: "Gate",
    price: "$39",
    annual: "$32",
    period: "/ month",
    amount: 39,
    blurb: "The qualification gate, the Meta signal, and everything that makes them work.",
    features: [
      "2 scorecards",
      "150 qualified responses / month",
      "Disqualified visitors free, unmetered",
      "Qualification gate",
      "Meta Pixel + CAPI with dedup",
      "Exclusion + retargeting audiences",
      "Qualified-only optimisation event",
      "Scoring, branching, result pages, PDF",
      "Webhook + CSV export",
      "1 user · 1 ad account",
      "Assess360 badge shown",
    ],
    cta: "Start 14-day trial",
  },
  {
    name: "Signal",
    price: "$79",
    annual: "$69",
    period: "/ month",
    amount: 79,
    blurb: "Your brand, your domain, AI-written reports - and the badge comes off.",
    features: [
      "10 scorecards",
      "1,000 qualified responses / month",
      "Everything in Gate, plus:",
      "Custom domain + your branding",
      "Assess360 badge removed",
      "AI-written reports (your own key)",
      "Heatmap + session recording",
      "Manual-review screening fields",
      "3 users · 2 ad accounts",
    ],
    cta: "Start 14-day trial",
    highlight: true,
    badge: "14-day trial",
  },
  {
    name: "Agency",
    price: "$199",
    annual: "$175",
    period: "/ month",
    amount: 199,
    blurb: "Run qualification for every client from one account, under your own name.",
    features: [
      "Unlimited scorecards",
      "5,000 qualified responses / month",
      "Everything in Signal, plus:",
      "Client sub-accounts, white-label",
      "API access",
      "10 users · 10 ad accounts",
      "Extra ad accounts $15 each / month",
    ],
    cta: "Start 14-day trial",
  },
  {
    name: "Enterprise",
    price: "from $499",
    annual: null,
    period: "/ month",
    amount: 499,
    blurb: "Negotiated caps, SSO and an SLA - priced to what you actually run.",
    features: [
      "Unlimited scorecards",
      "Custom qualified-response cap",
      "Everything in Agency, plus:",
      "SSO",
      "SLA + dedicated onboarding",
      "Custom users + ad accounts",
    ],
    cta: "Talk to us",
  },
];

/** The comparison matrix. Server-rendered so an AI crawler can read every cell. */
export const PLAN_NAMES = ["Gate", "Signal", "Agency", "Enterprise"] as const;

export type MatrixRow = {
  label: string;
  /** One cell per plan: "✓", "-", or text. */
  cells: readonly [string, string, string, string];
  /** Rendered emphasised - the rows that are the reason to switch. */
  strong?: boolean;
  /** Rendered in italics - the unmetered line. */
  note?: boolean;
};

export const PLAN_MATRIX: ReadonlyArray<MatrixRow> = [
  { label: "Monthly", cells: ["$39", "$79", "$199", "from $499"], strong: true },
  { label: "Annual, per month", cells: ["$32", "$69", "$175", "custom"] },
  { label: "Scorecards", cells: ["2", "10", "Unlimited", "Unlimited"] },
  { label: "Qualified responses", cells: ["150", "1,000", "5,000", "Custom"] },
  { label: "Disqualified visitors", cells: ["Free, unmetered", "Free", "Free", "Free"], note: true },
  { label: "Users", cells: ["1", "3", "10", "Custom"] },
  { label: "Ad accounts", cells: ["1", "2", "10 (+$15 ea.)", "Custom"] },
  { label: "Qualification gate", cells: ["✓", "✓", "✓", "✓"], strong: true },
  { label: "Meta Pixel + CAPI, dedup", cells: ["✓", "✓", "✓", "✓"], strong: true },
  { label: "Exclusion + retargeting audiences", cells: ["✓", "✓", "✓", "✓"], strong: true },
  { label: "Qualified-only optimisation event", cells: ["✓", "✓", "✓", "✓"], strong: true },
  { label: "First-party match keys", cells: ["✓", "✓", "✓", "✓"] },
  { label: "Scoring, branching, result pages, PDF", cells: ["✓", "✓", "✓", "✓"] },
  { label: "Webhook + CSV export", cells: ["✓", "✓", "✓", "✓"] },
  { label: "Back-button / repeat lock", cells: ["✓", "✓", "✓", "✓"] },
  { label: "Assess360 badge", cells: ["Shown", "Removed", "Removed", "Removed"] },
  { label: "Custom domain + branding", cells: ["-", "✓", "✓", "✓"] },
  { label: "AI-written reports (BYO key)", cells: ["-", "✓", "✓", "✓"] },
  { label: "Heatmap / session recording", cells: ["-", "✓", "✓", "✓"] },
  { label: "Manual-review screening fields", cells: ["-", "✓", "✓", "✓"] },
  { label: "Client sub-accounts, white-label", cells: ["-", "-", "✓", "✓"] },
  { label: "API access", cells: ["-", "-", "✓", "✓"] },
  { label: "SSO, SLA, onboarding", cells: ["-", "-", "-", "✓"] },
];

/** The single best line on the page - true to how the product works. */
export const PRICING_HEADLINE =
  "Disqualified visitors don't count against your response limit.";
export const PRICING_SUB =
  "You only pay for the leads worth keeping. Every other tool on this list meters raw submissions - a rejection here stores no lead and no result, so there is nothing to meter.";

export const TRIAL_NOTE =
  "14-day Signal trial, no card. At day 15 the account parks read-only - your scorecard pauses, your data stays.";

export const OVERAGE_NOTE = "Overage: $15 per extra 500 qualified responses.";

export const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "How is a scorecard different from a form?",
    a: "A form collects answers. A scorecard evaluates them - weighting each response against your fit criteria and returning a score, a result, and a next step. You learn who someone is, not just how to reach them.",
  },
  {
    q: "Can I qualify leads, not just collect emails?",
    a: "That's the point. Every response is scored the moment it's submitted, so you can route, prioritize, or disqualify based on fit before a rep ever reaches out.",
  },
  {
    q: "Do I need to re-host anything?",
    a: "No. Every assessment is hosted for you on a single link, with a personalized result page for each respondent. Point a custom domain at it when you want it on your own brand.",
  },
  {
    q: "Can I run it on my own brand and domain?",
    a: "Yes. Point a custom domain at your workspace and set your own brand colors and logo - the whole scorecard and result experience runs as yours.",
  },
  {
    q: "What happens at my response limit?",
    a: "Only qualified responses count - disqualified visitors are never metered. You'll get a heads-up as you approach the limit. Past it, answers are still captured and nothing is lost, but new results are held until you upgrade, so no lead disappears while you decide.",
  },
];

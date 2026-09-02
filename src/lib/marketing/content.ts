// ============================================================================
//  Marketing landing content — the single place to edit copy, prices, and FAQ.
//  Rendered only on the platform root domain (assess360.divineleads.guru).
// ============================================================================

export const MARKETING = {
  name: "Assess360",
  // Public URL of the marketing home (used for canonical + JSON-LD).
  domain: "https://assess360.divineleads.guru",
  // Internal links — same domain, same service.
  signupHref: "/sign-up",
  signinHref: "/sign-in",
  heroImage: "/hero-scorecard.png",
  ogImage: "/og-image.png",
  title: "Assess360 — Qualify leads before the sales call",
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
    body: "Send one hosted link — in email, ads, or on your site. No embed, no re-hosting.",
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
    body: "Assign points per answer and weight each category, so the final score reflects real fit — not just completion.",
  },
  {
    title: "Dynamic result pages",
    body: "Every respondent gets a personalized, hosted result: their score, their strengths, and a clear next step.",
  },
  {
    title: "AI-written result reports",
    body: "Connect your own OpenAI, Claude, or Gemini key and let it write a short, personalized report for each respondent.",
  },
  {
    title: "Conversion tracking",
    body: "Fire server-side lead and purchase events to Meta Pixel and the Conversions API, deduplicated, so your ad optimization sees real outcomes.",
  },
  {
    title: "Branded PDF reports",
    body: "Turn each scored result into a clean, branded PDF your respondents can download and your team can keep.",
  },
  {
    title: "Result interpretation & bands",
    body: "Map scores to named bands, each with its own tailored message and recommended next step.",
  },
  {
    title: "Lead export & integrations",
    body: "Push each scored lead to your CRM by webhook or Zapier, or export clean CSVs whenever you need them.",
  },
  {
    title: "Custom domain & branding",
    body: "Run the whole experience on your own domain, in your own brand colors and logo.",
  },
  {
    title: "Conditional logic & branching",
    body: "Show the next question based on the last answer — shorter paths for respondents, sharper signal for you.",
    soon: true,
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
  price: string;
  period: string;
  blurb: string;
  features: ReadonlyArray<string>;
  cta: string;
  highlight?: boolean;
  badge?: string;
};

// USD for all countries, no geo-detection. Display only — checkout (Razorpay)
// happens inside the app.
export const TIERS: ReadonlyArray<Tier> = [
  {
    name: "Free",
    price: "$0",
    period: "forever",
    blurb: "Publish your first scorecard and start reading real fit signal.",
    features: [
      "1 assessment",
      "25 responses / month",
      "Hosted results page",
      "Email capture",
      "Assess360 badge",
    ],
    cta: "Start free",
  },
  {
    name: "Starter",
    price: "$39",
    period: "/ month",
    blurb: "Route qualified leads straight into the tools your team already uses.",
    features: [
      "3 assessments",
      "300 responses / month",
      "Branded PDF reports",
      "Webhook / Zapier",
      "Lead export",
      "1 seat",
    ],
    cta: "Start free",
  },
  {
    name: "Growth",
    price: "$89",
    period: "/ month",
    blurb: "Run it on your own brand and measure what converts.",
    features: [
      "15 assessments",
      "2,000 responses / month",
      "Custom domain",
      "Branding removed",
      "GA / Pixel tracking",
      "Split testing (coming soon)",
      "3 seats",
    ],
    cta: "Start free",
    highlight: true,
    badge: "Most popular",
  },
  {
    name: "Scale",
    price: "$199",
    period: "/ month",
    blurb: "Operate scorecards for every client from one account.",
    features: [
      "Unlimited assessments",
      "12,000 responses / month",
      "Staff roles & permissions",
      "API access",
      "AI result reports",
      "5+ seats",
      "Priority support",
    ],
    cta: "Start free",
  },
];

export const FOUNDING_NOTE =
  "Founding cohort — the first 100 accounts lock this rate for life.";

export const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "How is a scorecard different from a form?",
    a: "A form collects answers. A scorecard evaluates them — weighting each response against your fit criteria and returning a score, a result, and a next step. You learn who someone is, not just how to reach them.",
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
    a: "Yes. Point a custom domain at your workspace and set your own brand colors and logo — the whole scorecard and result experience runs as yours.",
  },
  {
    q: "What happens at my response limit?",
    a: "Collection keeps working — nothing breaks and no lead is lost. You'll get a heads-up as you approach the limit, and can upgrade any time to raise it.",
  },
];

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
  /**
   * 🟡 WHERE EVERY CALL TO ACTION GOES.
   *
   * Not /sign-up and not /build: the platform sells itself with its own product, so a
   * visitor who is interested takes the scorecard first and we see what they answered
   * before they ever see a pricing table. One constant, because the slug has to be
   * changeable in one edit - and because a slug hardcoded in nineteen components is a
   * slug that gets half-changed.
   *
   * Always linked through <CtaLink>, which keeps the ad's utm/click-id params on the
   * URL into the funnel; the funnel then carries them on to /sign-up.
   */
  ctaHref: "/a/paying-for-junk-leads",
  heroImage: "/hero-scorecard.png",
  // NOTE: no ogImage key. The share card is GENERATED at /opengraph-image (see
  // app/opengraph-image.tsx) and injected into every route by Next's file convention,
  // so there is no static file to keep in sync - and no path that can 404 the way
  // /og-image.png did for as long as it was referenced here without ever existing.
  /**
   * 🔴 THE TITLE NAMES THE CATEGORY, NOT THE PROMISE.
   *
   * "Assess360" is a crowded name in search: an IT consultancy, a corporate
   * change-management product and an Indian assessment company all use it or a near
   * variant. On the one query where the answer has to be unambiguous - the brand name
   * itself - a title that says only "qualify leads before the sales call" leaves Google
   * to decide which Assess360 this is from the body copy.
   *
   * So the title binds the two strings that have to travel together, and the PROMISE
   * stays where it converts: the H1 ("Know which leads are worth a sales call") and the
   * description below. Both are visible on the result, so nothing is lost.
   */
  title: "Assess360 - Lead Qualification Software",
  /** Leads with the category phrase for the same reason, and still reads like a
   *  sentence rather than a keyword list. Used for the meta description, the
   *  SoftwareApplication node and llms.txt, so the three cannot drift. */
  description:
    "Assess360 is lead qualification software: it scores every prospect against your fit criteria, so your team only talks to the leads that are actually ready to buy.",
  /** A spacing variant real people type and real sources print. Fed to schema.org
   *  alternateName so the entity absorbs it instead of a competitor doing so. */
  alternateName: "Assess 360",
  /** One sentence about the ENTITY (not the product), for the Organization node. */
  organizationDescription:
    "Assess360 builds lead qualification software: hosted scorecards that score each enquiry against the criteria a business sets, and report the qualified ones back to the ad platform that produced them.",
} as const;

// ---------------------------------------------------------------------------
//  Button labels. Declared here, above everything that reads them, because TIERS
//  and HERO are module-level consts: a label defined further down the file would be
//  in its temporal dead zone when they initialise, and the page would not render.
// ---------------------------------------------------------------------------

/**
 * The label on every trial button: nav, hero secondary, all three priced tiers, and
 * the SEO blocks. One constant, because the same words used to be typed out in four
 * separate components - which is how "Start 14-day trial" came to sit on buttons that
 * open a scorecard.
 *
 * It says QUALIFY because that is what the button now does. The click opens the
 * scorecard, not a signup form, and the trial it leads to is the one TRIAL_NOTE
 * describes directly underneath - so the offer is still on the page, in the line that
 * can carry its conditions.
 */
export const TRIAL_CTA = "Qualify me for 14 days trial";

/**
 * The label on the done-for-you buttons: hero primary, the metering section, the
 * built-with-you block, the comparison pages, the industry offer and the calculator.
 * Same destination as TRIAL_CTA (the scorecard); different framing, for the reader who
 * would rather we built it than drive the builder themselves.
 */
export const DFY_CTA = "Qualify, build my free scorecard";

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
    title: "A different exit for each answer",
    body: "An employee, a practitioner you would rather send elsewhere, and a founder who simply cannot make your dates are three different answers - not one rejection. Each disqualifying answer names its own exit, and you write what each one says.",
  },
  {
    title: "Score bands, not one yes or no",
    body: "Gate answers carry points. Above your threshold they go straight through; in the band below it they still go through, flagged for you to read before the call; under that they are routed out. One weak answer no longer loses someone who is strong everywhere else.",
  },
  {
    title: "A waitlist, instead of a rejection",
    body: "Someone who clears every bar and cannot make the dates is a lead with a timing problem. That route takes the whole assessment like anybody else and lands on the same result page with a different close, so you keep the finished diagnosis and they keep their place.",
  },
  {
    title: "Manual-review screening questions",
    body: "Add free-text questions - company name, website, what the business does - captured with each qualified lead, so you can eyeball the ones who slip through and disqualify fakers by hand.",
  },
  {
    title: "Named audience lists",
    body: "Keep as many lists of roles as the work needs and point each scorecard at the one it uses, so a clinic funnel and a coaching funnel stop sharing one vocabulary that suits neither.",
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
    // 🔴 NOT BUILT. The card claimed a feature that does not exist: the text importer
    // parses a list you paste, it calls no model. Flagged rather than deleted, because
    // the build is scheduled - but an unbuilt feature advertised flat is the one thing
    // on this page a competitor could screenshot.
    title: "AI question generation",
    soon: true,
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
    title: "One event per exit",
    body: "Each exit reports its own Meta event, or none at all. A waitlist sign-up never lands in your exclusion audience and never in the event your ads optimise toward, so the algorithm is not quietly taught to go and find more people who cannot come.",
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
    cta: TRIAL_CTA,
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
      "Conditional exit routes + score bands",
      "3 users · 2 ad accounts",
    ],
    cta: TRIAL_CTA,
    highlight: true,
    badge: "14-day trial",
  },
  {
    name: "Agency",
    price: "$249",
    annual: "$219",
    period: "/ month",
    amount: 249,
    blurb: "Six workspaces, not one: yours, and five you run for the people who hire you.",
    features: [
      "Your own workspace, plus 5 agency tenants",
      "An agency tenant is one full workspace for one client",
      "Each workspace: 1,000 responses / month",
      "Each workspace: its own ad account, pixel and domain",
      "Each workspace: its own Razorpay and webhooks",
      "Everything in Signal, in every workspace",
      "Run them all from your one login",
      "Bulk import a finished scorecard into each",
      "API tokens for conversion lookups",
      "Extra agency tenants $29 / month each",
    ],
    cta: TRIAL_CTA,
  },
  {
    name: "Enterprise",
    price: "from $599",
    annual: null,
    period: "/ month",
    amount: 599,
    blurb: "Negotiated caps and terms - priced to what you actually run.",
    features: [
      "Your own workspace, plus 20 agency tenants",
      "Everything in Agency, plus:",
      "Negotiated caps on any workspace",
      "SSO, SLA and onboarding by agreement",
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
  { label: "Monthly", cells: ["$39", "$79", "$249", "from $599"], strong: true },
  { label: "Annual, per month", cells: ["$32", "$69", "$219", "custom"] },
  { label: "Workspaces", cells: ["1", "1", "1 + 5 agency tenants", "1 + 20"], strong: true },
  { label: "Scorecards", cells: ["2", "10", "10 per workspace", "10 per workspace"] },
  { label: "Qualified responses", cells: ["150", "1,000", "1,000 per workspace", "Negotiated"] },
  { label: "Disqualified visitors", cells: ["Free, unmetered", "Free", "Free", "Free"], note: true },
  { label: "Users", cells: ["1", "3", "1 per workspace", "1 per workspace"] },
  { label: "Ad accounts", cells: ["1", "2", "1 per workspace", "1 per workspace"], strong: true },
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
  // Bands on every paid tier, the router from Signal: the safety net is what makes a
  // gate safe to set a real bar on, and selling it as the upgrade leaves it missing
  // from the plan a first-time buyer picks. See PAID_BASE_FEATURES.
  { label: "Score bands on gate answers", cells: ["✓", "✓", "✓", "✓"], strong: true },
  { label: "Conditional exit routes per answer", cells: ["-", "✓", "✓", "✓"] },
  { label: "Waitlist route", cells: ["-", "✓", "✓", "✓"] },
  { label: "One Meta event per exit", cells: ["-", "✓", "✓", "✓"] },
  { label: "Named audience lists", cells: ["✓", "✓", "✓", "✓"] },
  { label: "Bulk import a finished scorecard", cells: ["-", "-", "✓", "✓"] },
  // Named for what it IS. "API access" reads as a general platform API, and this is
  // scoped bearer tokens for two purpose-built conversion endpoints - documented at
  // /api-docs, which says the same thing in the same words.
  { label: "API tokens (conversion lookups)", cells: ["-", "-", "✓", "✓"] },
];

/** The single best line on the page - true to how the product works. */
export const PRICING_HEADLINE =
  "Disqualified visitors don't count against your response limit.";
export const PRICING_SUB =
  "You only pay for the leads worth keeping. Every other tool on this list meters raw submissions - a rejection here stores no lead and no result, so there is nothing to meter.";

export const TRIAL_NOTE =
  "14-day Signal trial, no card. At day 15 the account parks read-only - your scorecard pauses, your data stays.";

/**
 * 🔴 NOT "$15 per extra 500 qualified responses". That was the plan for metered overage
 * and no code ever charged it: going over the cap runs CAPTURE-BUT-LOCK (see gate.ts).
 * The answers are stored, the lead and the result are withheld until the plan is raised,
 * and raising it unlocks everything retroactively with no backfill.
 *
 * Which is a better promise than the invoice was, and the only one that is true: a buyer
 * told their overflow costs $15 would discover instead that it was held back, on the day
 * their campaign worked harder than they expected.
 */
export const OVERAGE_NOTE =
  "Over your cap, answers are still captured - the leads unlock the moment you raise the plan. Nothing is lost.";

export const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    // Replaces the speed question. "How fast is it" invites a promise that depends on
    // things we do not control - their pixel access, their answers, a weekend. What
    // happens on the call is entirely within our control, so it can be stated exactly.
    q: "What happens on the 30-minute call?",
    a: "First you send us a short brief, so we arrive already knowing your offer and who wastes your time. On the call we set your workspace up, lay the scorecard in, tweak the gate with you, connect your Meta pixel and the Conversions API, and build the exclusion and retargeting audiences in your ad account. You are in the room while it happens.",
  },
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
  {
    q: "Will screening people out make me look arrogant to the good leads?",
    a: "It does the opposite. Everyone who passes the gate gets a real score, a named band that tells them where they actually stand, and a recommended next step. Being assessed feels like being helped, which is why qualified respondents arrive at the call already treating you as the expert.",
  },
  {
    q: "Do I need the top plan to stop losing borderline leads?",
    a: "No. Score bands are on every paid plan, including the entry one, because a gate nobody dares set a real bar on is a gate that does not work. What the higher plans add is the router: a named exit for each disqualifying answer, each with its own page and its own Meta event, so a waitlist and a wrong-fit rejection stop sharing one audience.",
  },
  {
    q: "What happens to someone who fits but cannot start right now?",
    a: "He is not a rejection, he is a lead with a timing problem. He takes the full assessment like anyone else and lands on the same result page with a waitlist close, so you keep the finished diagnosis and he keeps his place. His exit fires its own Meta event, separate from both your exclusion audience and the event your ads optimise toward. Because he completes the assessment and you keep the result, he counts as a qualified response; only the people your gate turns away are unmetered.",
  },
];

// ===========================================================================
//  Gate -> Score -> Signal: the mechanism, and the spine of the home page.
// ===========================================================================

/**
 * The category is NEGATIVE lead generation. Every other tool in this market is paid to
 * deliver more leads; this one is paid to deliver fewer. The mechanism is three steps,
 * and the THIRD is the only one a competitor cannot also claim: a gate is buyable, a
 * weighted score is buyable, teaching the ad platform to stop finding the wrong people
 * is not. So the page leads with the mechanism and lists features underneath it.
 *
 * Previous hero, kept because it is the line the old ads and the old OG card still use:
 *   eyebrow  "Lead qualification, not just capture, not just assess"
 *   headline "Know which leads are worth a sales call - before you make one."
 */
// ===========================================================================
//  The done-for-you offer. ONE source for the wording and the slot count.
// ===========================================================================

/**
 * How many free builds the offer covers.
 *
 * 🔴 Exported and referenced everywhere the number appears, never typed into copy. It
 * shows up in the announcement bar, the call-to-action sub-line and the admin default,
 * and a figure repeated in three places is a figure that will eventually disagree with
 * itself in front of a buyer.
 */
export const OFFER_SLOTS = 20;

/**
 * The offer, in the exact words it is allowed to use.
 *
 * There is no delivery-time promise anywhere in here, on purpose. "Built in 24 hours"
 * was a clock that started the moment somebody submitted a form, ran whether or not we
 * had their pixel, and could be missed by a weekend. "One 30-minute call" is a thing
 * that either happens or does not, and the customer is in the room when it does.
 */
export const OFFER = {
  /** The sticky bar above the nav. {slots} is filled from the live remaining count. */
  bar: (slots: number) =>
    `First ${OFFER_SLOTS}: we build your qualifying scorecard free and take it live on one 30-minute call. ${slots} slots left.`,
  /** The sub-line under EVERY primary call to action. Same words in every placement. */
  ctaSubline: `One 30-minute call. We build it, wire it to your ads, and it goes live before you hang up. ${OFFER_SLOTS} slots.`,
} as const;

export const HERO = {
  eyebrow: "Negative lead generation",
  // Names the SECOND cost, which is the one nobody has priced. Everyone selling a quiz
  // says the first half; the sentence that is ours is that the bad lead does not just
  // cost you a click, it teaches the auction to go and find more of him.
  headline: "You are not paying for bad leads once. You are teaching Meta to find more of them.",
  sub: "A gate runs before the opt-in, so wrong-fit traffic never becomes a lead record. Everyone who passes is scored against criteria you weight. Then only the qualified ones report back to Meta, and the rejected ones build an exclusion audience. Your campaigns stop shopping in the wrong aisle, and your cost per qualified lead falls.",
  primaryCta: DFY_CTA,
  secondaryCta: TRIAL_CTA,
} as const;

/**
 * The second cost, directly under the hero.
 *
 * The first cost is in Ads Manager and everybody has already seen it. The one that
 * decides whether this product is worth anything is the hour a rep spends on a call
 * that was never going to close, and that one appears on no invoice - which is exactly
 * why it goes unmanaged.
 */
export const REAL_COST = {
  heading: "A bad lead costs you twice. The second time is the expensive one.",
  paras: [
    "The first cost is the click, and you can see it in Ads Manager. The second cost is the 45 minutes your rep spends on a call that was never going to close, and that one never appears on any invoice.",
    "Run 40 calls a month. If half are wrong-fit, that is 15 hours gone, plus the ad spend that bought them, plus the spend tomorrow when the algorithm goes looking for more of the same person. The leak is not your sales skill. It is that nothing in your funnel ever told the machine who was worth buying.",
  ],
} as const;

/**
 * The fear section.
 *
 * The objection that actually kills this sale is not price and not setup time: it is "I
 * am scared to turn away someone I could have closed". Loss aversion beats efficiency,
 * every time, and it is why people buy a quiz tool and then never configure the hard
 * questions. These four capabilities are the answer to it, which is why they are a
 * section of their own rather than four cards among nineteen.
 */
export const NO_GOOD_LEAD = {
  heading: "The reason most people never set a real bar is fear of losing someone good.",
  intro:
    "A gate that only says yes or no is a bouncer, and nobody trusts a bouncer with their pipeline. This one is a router. A strong lead with one weak answer is banded and flagged, not lost. A lead who fits everything except your dates finishes the whole assessment, lands on the same result page with a different close, and keeps his place. Each exit reports its own Meta event, or none at all, so a waitlist sign-up never teaches your ads to go and find more people who cannot come.",
  /** The four capability titles promoted into this section. Looked up in CAPABILITIES,
   *  so the copy lives in exactly one place and cannot drift from the feature list. */
  titles: [
    "Score bands, not one yes or no",
    "A different exit for each answer",
    "A waitlist, instead of a rejection",
    "One event per exit",
  ],
  closing:
    "You can set the bar where it should be, because the people above it are no longer the only ones you keep.",
} as const;

/** The done-for-you offer. One place, because it appears on most public surfaces. */
export const DFY = {
  // No `href` any more. Every CTA on every surface now goes to MARKETING.ctaHref (the
  // funnel), so a constant that still said "/build" was a second front door waiting for
  // somebody to link it by accident. The /build page itself is unchanged and still
  // reachable; it is just no longer what the buttons point at.
  heading: "We build your first scorecard with you, free, on one 30-minute call",
  body: "Tell us what you sell and who wastes your time. We write the gate, the questions, the weights and the result bands, and bring the draft to a 30-minute call where we wire it to your ads and put it live. You do not touch the builder unless you want to.",
  cta: DFY_CTA,
} as const;

/**
 * The metering argument, promoted out of the pricing table.
 *
 * It belongs high on the page because it is the only claim here that is structural
 * rather than promotional: it is checkable against an invoice, and it describes an
 * incentive, not a feature. PRICING_HEADLINE is reused verbatim so the sentence cannot
 * drift between the two places it now appears.
 */
export const METERING = {
  heading: PRICING_HEADLINE,
  lead: "Not a discount. A different business model, and you can check it on your invoice.",
  points: [
    { text: "Every other assessment tool meters raw submissions.", strong: ["raw submissions"] },
    {
      text: "Read that as an incentive. They earn more when more unqualified people get through.",
      strong: ["earn more when more unqualified people get through"],
    },
    { text: "Here, a visitor who fails your gate stores nothing. No lead, no submission, no result.", strong: ["stores nothing"] },
    { text: "Nothing stored means nothing to meter, and nothing to bill you for.", strong: ["nothing to bill you for"] },
    { text: "We earn more only when you capture leads worth having.", strong: ["only when you capture leads worth having"] },
    // Said out loud, because this is the one claim a customer can audit, and the one
    // place the new waitlist route could have made it quietly untrue. A waitlist lead
    // completes the assessment and has a result on file, so it is a captured lead and
    // it is metered. Leaving that to be discovered on an invoice would cost more trust
    // than the sentence costs conversions.
    {
      text: "A waitlist lead finishes the assessment, so it counts. Only the people your gate turns away are free.",
      strong: ["so it counts"],
    },
    { text: "It is the one claim on this page you can verify from your own invoice.", strong: ["verify from your own invoice"] },
  ],
} as const;

export type Pillar = {
  key: "gate" | "score" | "signal";
  step: string;
  name: string;
  tagline: string;
  body: string;
  /**
   * Capability titles, in render order.
   *
   * Membership lives HERE as a list of titles rather than as a field on each of the 19
   * capabilities, for one reason: nothing in CAPABILITIES has to be edited to group it,
   * so the re-grouping cannot quietly drop a card. Anything a pillar does not claim
   * renders in the supporting row instead of vanishing (see supportingCapabilities).
   */
  titles: ReadonlyArray<string>;
};

export const PILLARS: ReadonlyArray<Pillar> = [
  {
    key: "gate",
    step: "01",
    name: "Gate",
    tagline: "Nothing wrong-fit becomes a lead",
    body: "The screen runs BEFORE the opt-in, not after it. A visitor who fails never reaches the form, so there is no lead record, no stored result and nothing to clean out of your CRM later.",
    // The four routing cards are NOT here: they were promoted into their own section
    // (NO_GOOD_LEAD), because the fear of turning away someone good is the objection
    // that decides this sale and it cannot be answered from card eleven of nineteen.
    // Listed in one place only - a copy left behind here would render them twice.
    titles: [
      "Pre-assessment qualification gate",
      "Repeat & back-button protection",
      "Manual-review screening questions",
      "Conditional logic & branching",
    ],
  },
  {
    key: "score",
    step: "02",
    name: "Score",
    tagline: "The rest get ranked, and told the truth",
    body: "Everyone who passes the gate is scored against the criteria you weight, and gets a result that names where they actually stand and what to do next. Ranking your pipeline and being useful to the respondent are the same act.",
    titles: [
      "Weighted scoring engine",
      "Result interpretation & bands",
      "Dynamic result pages",
      "AI question generation",
      "AI-written result reports",
      "Branded PDF reports",
    ],
  },
  {
    key: "signal",
    step: "03",
    name: "Signal",
    tagline: "Your ads learn who to stop finding",
    body: "The step nobody else has. Qualified completions report back as their own conversion event and the disqualified build an exclusion audience, so the algorithm stops buying the traffic that was never going to close. A gate saves your calendar; this saves your ad budget.",
    titles: [
      "Meta Pixel + Conversions API",
      "Audience exclusion + retargeting on autopilot",
      "Qualified-only optimization signal",
      "Auto-exclude the unqualified",
      "First-party match keys",
    ],
  },
];

/**
 * Everything no pillar claimed, in the order it appears in CAPABILITIES.
 *
 * Derived rather than listed, so a capability added to CAPABILITIES and forgotten here
 * still renders. The failure mode of a hand-kept second list is a feature that silently
 * leaves the site, and nobody notices because nothing errors.
 */
export const supportingCapabilities = (): ReadonlyArray<Capability> => {
  // Claimed by a PILLAR or by the fear section. Both have to be here: the derivation is
  // "anything nobody claimed", and promoting the four routing cards into their own
  // section unclaimed them, so they rendered once there and again down here as though
  // they were leftovers. The whole point of promoting them was that they are not.
  const claimed = new Set([...PILLARS.flatMap((p) => p.titles), ...NO_GOOD_LEAD.titles]);
  return CAPABILITIES.filter((c) => !claimed.has(c.title));
};

/** Look up the capabilities of one pillar, in the pillar's own order. */
export const pillarCapabilities = (p: Pillar): ReadonlyArray<Capability> =>
  p.titles
    .map((t) => CAPABILITIES.find((c) => c.title === t))
    .filter((c): c is Capability => c !== undefined);

/**
 * Why this exists. No founder name and no photo on purpose: the credential is the fact,
 * and a face invites the reader to assess the person instead of the argument.
 *
 * Bullets rather than prose, and short ones. This sits directly under the hero now,
 * where a reader is still deciding whether to keep reading - two dense paragraphs at
 * that position get skipped, and a skipped section is the same as an absent one. Each
 * line carries ONE fact, with the load-bearing words marked so the section survives
 * being skimmed rather than read.
 *
 * `strong` is matched against the line and rendered bold. Plain strings, not markup, so
 * the copy stays editable by someone who does not write HTML.
 */
export const WHY_EXISTS = {
  heading: "Built out of what kept going wrong. Not designed in a workshop.",
  lead: "Every line below is a wall this hit in a live funnel, with real budget behind it.",
  points: [
    {
      text: "I paid for ScoreApp, Typeform, Outgrow, LeadQuizzes and Interact.",
      strong: ["paid for"],
    },
    {
      text: "I ran cold Meta traffic through all of them. Real budget, not a demo.",
      strong: ["Real budget"],
    },
    {
      text: "Every one collected answers brilliantly. Not one of them asked whether the person was worth a call.",
      strong: ["worth a call"],
    },
    {
      text: "So the gate was built. The opt-in was happening before anyone knew who it was.",
      strong: ["the gate"],
    },
    {
      text: "Then the exclusion event, because the ad account kept buying more of the same wrong people.",
      strong: ["the exclusion event"],
    },
    {
      text: "Then the qualified-only signal, because Meta was being taught to find form-fillers.",
      strong: ["the qualified-only signal"],
    },
    {
      text: "Every feature on this page started as a wall in a live funnel that cost real money.",
      strong: ["cost real money"],
    },
  ],
} as const;


/**
 * Who it is for.
 *
 * The audiences are NOT listed here. They are read from TEMPLATE_CATEGORIES, the same
 * list the template library is organised by, so this section can never advertise an
 * audience the product has nothing for - and a new vertical appears on the home page
 * the moment its scorecard is added, with nobody having to remember.
 *
 * verify:templates asserts every category has at least one built-in behind it, which is
 * what makes the sentence below true rather than merely plausible.
 */
export const AUDIENCES = {
  heading: "Who it is for",
  lead: "Anyone who buys traffic and pays for it twice: once for the click, and again in the hour someone spends on a call that was never going to close.",
  note: "Every audience below has a ready-made scorecard in the library, with the gate questions already written. Start from one and change the wording, or write your own from scratch.",
} as const;
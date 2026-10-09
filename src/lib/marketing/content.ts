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
    // Replaces the speed question. "How fast is it" invites a promise that depends on
    // things we do not control - their pixel access, their answers, a weekend. What
    // happens on the call is entirely within our control, so it can be stated exactly.
    q: "What happens on the 30-minute call?",
    a: "We connect your Meta pixel and the Conversions API, build the exclusion and retargeting audiences, point your custom domain at it, fire test events and confirm they arrive, and take the scorecard live. The draft is already in your dashboard before the call starts, so the half hour is spent wiring it up rather than writing questions.",
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
  headline: "The wrong leads never become leads. And your ads learn to stop finding them.",
  sub: "A gate runs before the opt-in, so wrong-fit traffic never becomes a lead record. Everyone who passes is scored against criteria you weight. Then only the qualified ones are reported back to Meta, so your campaigns optimise toward buyers instead of form-fillers.",
  primaryCta: "Get my scorecard built free",
  secondaryCta: "Start 14-day trial",
} as const;

/** The done-for-you offer. One place, because it appears on most public surfaces. */
export const DFY = {
  href: "/build",
  heading: "We build your first scorecard with you, free, on one 30-minute call",
  body: "Tell us what you sell and who wastes your time. We write the gate, the questions, the weights and the result bands, and bring the draft to a 30-minute call where we wire it to your ads and put it live. You do not touch the builder unless you want to.",
  cta: "Get my scorecard built free",
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
  const claimed = new Set(PILLARS.flatMap((p) => p.titles));
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
  heading: "Why this exists",
  lead: "Not designed in a workshop. Built by an operator, out of what kept going wrong.",
  points: [
    {
      text: "I paid for ScoreApp, Typeform, Outgrow, LeadQuizzes and Interact.",
      strong: ["paid for"],
    },
    {
      text: "I ran real money through all of them. Cold Meta traffic, not a demo.",
      strong: ["real money"],
    },
    {
      text: "Every one collected answers brilliantly. None of them asked whether the person was worth a call.",
      strong: ["worth a call"],
    },
    {
      text: "So the gate was built. The opt-in was happening before anyone knew who it was.",
      strong: ["the gate"],
    },
    {
      text: "Then the exclusion event. The ad account kept buying more of the same wrong people.",
      strong: ["the exclusion event"],
    },
    {
      text: "Then the qualified-only signal. Meta was being taught to find form-fillers.",
      strong: ["the qualified-only signal"],
    },
    {
      text: "Every feature here started as a wall, in a real funnel, that cost real money.",
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
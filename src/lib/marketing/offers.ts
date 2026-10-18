// ============================================================================
//  The offers catalogue - every promotion the platform has ever published.
//
//  /offers renders this list and nothing else, so releasing a new offer is an edit
//  to this file rather than a new page: one more entry at the top of OFFERS, and the
//  page, the ordering and the closed-offer archive all follow from it.
//
//  An offer that has run its course is marked `status: "closed"` and KEPT. The URL
//  people were sent stays alive and tells them the truth, which is strictly better
//  than a 404 for anyone who kept the link or the screenshot.
//
//  🟡 THIS PAGE IS COLD-TRAFFIC ENTRY, NOT A SECOND LANDING PAGE. Ads point straight
//  here, so the MECHANISM is stated before the offer: a visitor who has never seen
//  the main page has to learn what the product does before "20 slots" means anything
//  to them. The way onward is the main page, which is where the product is argued and
//  the trial is taken. That ordering is the reason the blocks below are in this order,
//  and the reason the money question sits near the top instead of in a bullet list
//  halfway down.
// ============================================================================

export type OfferStatus = "open" | "closed";

/** One row of an offer's day-by-day plan. */
export type OfferStage = {
  /** The window, in the words a reader counts in: "Day 6", "Days 7 to 10". */
  days: string;
  title: string;
  body: string;
  /**
   * A second paragraph, under the body.
   *
   * It exists for the numbers. A client judging day 10 against their imagination is
   * the fastest way to lose one who is actually winning, so the stage that produces
   * leads says what to expect. Optional, because a number nobody has worked out must
   * not be invented to fill it (see EXPECTED) and the stage still reads without one.
   */
  note?: string;
};

/**
 * Something the applicant must already have.
 *
 * These are listed as prominently as the offer itself, because every one of them is a
 * thing that, missing, burns days off a clock that does not stop. The ad account in
 * particular: business verification is Meta's queue, not ours.
 */
export type OfferPrecondition = { title: string; body: string };

/**
 * One headed group of preconditions.
 *
 * Two groups rather than one list, because the single list was doing two different
 * jobs and reading like an interview for both. ELIGIBILITY decides whether to apply
 * at all, which is why it sits above the plan. PREPARATION is a kit list for the first
 * week, and a reader who meets the first group should feel they are getting ready
 * rather than being screened.
 */
export type OfferGroup = {
  title: string;
  intro?: string;
  items: readonly OfferPrecondition[];
};

/** One of the three mechanism steps, stated before the offer for cold traffic. */
export type OfferMechanismStep = { name: string; body: string };

/** The money question, answered early instead of in a bullet list halfway down. */
export type OfferCostItem = { title: string; body: string };

/**
 * Who is actually in the build.
 *
 * 🔴 NULL RENDERS NOTHING AND LEAVES A TODO IN THE MARKUP, ON PURPOSE. "Somebody from
 * here is in the build with you" was the biggest unanswered question on the page, and
 * an anonymous reassurance is worse than no block at all: it tells the reader we will
 * not say who, which is the answer they least want. A first name, a role and one line
 * of history, or the section does not exist.
 */
export type OfferBuilder = { name: string; role: string; built: string };

/** The day-10 expectations, worked out on day 5 from the client's own cost per click. */
export type OfferExpected = {
  clicksPerDay: string;
  gatePercent: string;
  qualifiedPerDay: string;
};

export type Offer = {
  slug: string;
  status: OfferStatus;
  /** Small label above the name. */
  eyebrow: string;
  /** The offer's name, as a heading. */
  name: string;
  /** The whole offer in one sentence, and the only line that has to be read. */
  promise: string;
  /**
   * What happens if the thing being promised does not happen.
   *
   * Stated beside the promise rather than left to be asked. An offer whose failure
   * case is unwritten reads as an offer with a catch in it.
   */
  fallbackNote?: string;
  /** The mechanism, before the offer, for traffic that has not read the main page. */
  mechanism?: {
    eyebrow: string;
    heading: string;
    steps: readonly OfferMechanismStep[];
    kicker: string;
  };
  /** What the support actually does, in prose. */
  paras: readonly string[];
  /** What it costs and what it does not. Early, because it is the first question. */
  cost?: { heading: string; items: readonly OfferCostItem[] };
  /** Null until the real person's details exist. See OfferBuilder. */
  builder?: OfferBuilder | null;
  /** What the offer takes out of the client's own week. */
  timeCommitment?: { heading: string; body: string };
  /** The plan both sides work to. */
  stages: readonly OfferStage[];
  /** Eligibility, then preparation. Rendered ABOVE the plan: it decides whether to read on. */
  entry?: readonly OfferGroup[];
  /** What is asked in return. Not a review, and not a condition of the build. */
  askInReturn?: { heading: string; body: string };
  /**
   * The hard limits, as a list.
   *
   * Superseded by `cost` for the founders offer, where the money question earned real
   * prose near the top. Kept because a CLOSED offer must still render the terms it
   * actually ran on, and those are in this shape.
   */
  terms: readonly string[];
  /**
   * The pre-`entry` single list, and the only one a closed offer has.
   *
   * Kept so the archive renders exactly what it ran on. New offers use `entry`.
   */
  preconditions: readonly OfferPrecondition[];
  /**
   * Where an application goes.
   *
   * 🔴 Never the trial call to action. The offer page deliberately carries no trial
   * link (see app/offers/page.tsx): somebody who reads this page and wants it should
   * land in the intake, where we can see whether the preconditions are met, rather
   * than self-serving a trial that the 21 days then run out of.
   */
  applyHref: string;
  applyLabel: string;
  /** What the intake actually asks, in the shape it asks it. Described, never guessed. */
  applyNote?: string;
  /** What happens after they send it. */
  applyFollowUp?: string;
  /**
   * Whether the live remaining-slots counter belongs on this offer.
   *
   * Only true for offers whose cap is the same cap the counter tracks (the
   * done-for-you build allowance). An offer with a cap of its own would need its own
   * count, and showing an unrelated number next to it would be a lie with arithmetic
   * in it.
   */
  countsSlots: boolean;
  /**
   * Print the live count only once it is BELOW this many. At or above it, print the cap.
   *
   * "18 of 20 slots left" is an advertisement for how few people took it. A count only
   * works as scarcity once it is actually scarce, and until then the honest line, and
   * the stronger one, is the cap on its own.
   */
  slotCounterThreshold?: number;
  /**
   * Last day applications are read, as an IST calendar date (YYYY-MM-DD).
   *
   * 🟢 THE PAGE CLOSES ITSELF. The campaign pointing here runs for a fixed window and
   * then moves to the main page or to the next offer, and an offer left standing open
   * with nobody watching it is a promise nobody is keeping. Past this date the page
   * renders its closed state with no call to action, whatever `status` still says.
   *
   * Null = no deadline, which is the honest state while the date is unset.
   */
  closesOn?: string | null;
  /** Shown in place of the call to action once the offer is closed. */
  closedNote?: string;
  /**
   * Blanks on this offer that real data has not filled yet.
   *
   * Emitted as HTML comments into the served page (see MarkupTodo in OfferDetail), so
   * "what is still unanswered here" is answerable by viewing source on the deployed
   * page rather than by reading this file. Derived below from the nulls, so the list
   * cannot drift from the values it describes.
   */
  todos?: readonly string[];
};

// ---------------------------------------------------------------------------
//  Founders offer: the three values an operator sets per cohort, and the one
//  person's details the page will not ship without.
// ---------------------------------------------------------------------------

/**
 * 🟡 TODO - COHORT 1 CLOSING DATE. The campaign pointing at this page runs for ten
 * days from launch, and the page is meant to say the day applications close. Set this
 * to that date (YYYY-MM-DD, IST) and the slots line prints it and the page closes
 * itself when it passes. Until then the line is the cap alone.
 */
const CLOSES_ON: string | null = null;

/**
 * 🟡 TODO - WHO IS IN THE BUILD. A first name, a role, and one line on what they have
 * built. The block does not render while this is null, which is deliberate: see
 * OfferBuilder. Do not fill it in with "our team".
 */
const BUILDER: OfferBuilder | null = null;

/**
 * 🟡 TODO - DAY 10 EXPECTATIONS. These are read off the client's own cost per click on
 * day 5. Numbers invented here would be a forecast nobody made, so while this is null
 * the stage says only that the figures are given on day 5, which is true.
 */
const EXPECTED: OfferExpected | null = null;

/**
 * The expectations sentence, or the honest version of it.
 *
 * A function taking the value as an argument rather than a ternary over the const: a
 * `const x: T | null = null` is narrowed to `null` by control flow, so the filled
 * branch would stop compiling the moment it is written, which is the opposite of what
 * a placeholder should do to the next person who fills it in.
 */
function expectedNote(e: OfferExpected | null): string {
  if (!e) {
    return "On day 5 we work out what to expect by day 10 from your own cost per click: clicks a day, the share of them stopped at the gate, and qualified leads a day. You get those figures before the week starts, so day 10 is judged against a number we gave you rather than against your imagination.";
  }
  return `At ₹1,000 a day you should expect roughly ${e.clicksPerDay} clicks a day, ${e.gatePercent} percent of them stopped at the gate, and ${e.qualifiedPerDay} qualified leads a day by the end of this week. We tell you these numbers on day 5, from your own cost per click, so you know on day 10 whether it is working.`;
}

const EXPECTED_NOTE = expectedNote(EXPECTED);

const FOUNDERS: Offer = {
  slug: "founders",
  status: "open",
  eyebrow: "Founders offer",
  name: "We build your whole qualifying funnel with you, free",
  promise:
    "The first 20 get it built inside the trial, over 21 days, in your own workspace and your own ad account. You keep spending what you already spend on ads. We do not touch that money.",
  fallbackNote:
    "If nobody has bought by day 21, the funnel is still yours and still live, and we stay on it with you until your first paying client, up to 30 days from the day you onboard. Your ads keep running while we change the creative or the messaging, and changing either takes about a day. You do not pay for the build either way.",

  mechanism: {
    eyebrow: "Negative lead generation",
    heading: "The wrong leads never become leads. And your ads learn to stop finding them.",
    steps: [
      { name: "Gate", body: "The questions that decide it get asked before anyone becomes a lead." },
      { name: "Score", body: "The ones who pass get ranked, so your calendar fills from the top." },
      {
        name: "Signal",
        body: "Only the qualified ones are sent to Meta, and the rejected ones go into an exclusion list.",
      },
    ],
    kicker: "Every other tool is paid to bring you more leads. This one is paid to bring you fewer.",
  },

  paras: [
    "This is not a template and a handover note. Somebody from here is in the build with you: the assessment and its gate, the landing page it sits behind, the pixel and the Conversions API, the exclusion and retargeting audiences, and the campaigns you launch on day 6.",
    "All of it is built in your own workspace and your own ad account, so all of it stays yours when the 21 days are up.",
  ],

  cost: {
    heading: "What this costs you, and what it does not",
    items: [
      {
        title: "The build is free",
        body: "It is part of the trial. There is nothing extra to buy, and no setup fee behind it.",
      },
      {
        title: "Your ad spend stays yours",
        body: "We never ask for it and we never handle it. You are already spending at least ₹1,000 a day, and that is the money the funnel runs on.",
      },
      {
        title: "The trial, and what happens after it",
        body: "14 days, no card. On day 15 the account parks read only: your scorecard pauses and your data stays. Nothing charges automatically, because there is no card on file to cancel. If you want it live after that, you pick a plan.",
      },
    ],
  },

  builder: BUILDER,

  timeCommitment: {
    heading: "What it takes out of your week",
    body: "About 30 minutes on day 1, around two hours spread across days 2 to 5, then your own sales calls from day 11. We do the building.",
  },

  entry: [
    {
      title: "Who this is for",
      items: [
        {
          title: "You are already running Meta ads",
          body: "At least ₹1,000 a day, running now, for at least the last 30 days. We need your current numbers to compare against. If you have never run ads, this offer cannot prove anything for you, and the main page is the better starting point.",
        },
        {
          title: "An offer that is ready to sell",
          body: "Something a client can pay you for this month. The price does not have to be settled, we work on that on day 1. We qualify leads for your offer. We do not invent the offer.",
        },
      ],
    },
    {
      title: "What to have ready",
      intro:
        "None of this is an interview. It is the kit the first week runs on, and the 21 days do not pause while one of them is being sorted out, so sort them out first.",
      items: [
        {
          title: "Your questions, or a template",
          body: "Bring the questionnaire you already qualify people with. If you do not have one, we start from a template and tune it with you.",
        },
        {
          title: "The pages and tools around it",
          body: "A product landing page, an opt-in form, a calendar, and a video call tool for your sales calls.",
        },
        {
          title: "Meta, set up and clean",
          body: "An ad account, a verified business manager, your Pixel ID and a Conversions API token. Business verification sits in Meta's queue, not ours, so start it before you apply. Your slot is not held while it is pending.",
        },
      ],
    },
  ],

  stages: [
    {
      days: "Day 1",
      title: "Product understanding, and finding the fit",
      body: "We go through what you sell, who buys it, and who has been wasting your time. If the fit is not there, you hear it on day 1 instead of on day 20.",
    },
    {
      days: "Days 2 to 5",
      title: "Setup",
      body: "Your questions, the gate, the scoring and the bands, the result page, the landing page it is linked from, pixel and Conversions API, and the audiences in your ad account. Built with you, in your workspace.",
      note: "We also read your last 30 days of ad data, so there is a before number to measure against.",
    },
    {
      days: "Day 6",
      title: "Ads launch",
      body: "Campaigns go live on the spend you are already running. We optimise on the gate-pass event, which fires the moment someone clears your gate. That is the highest-volume qualified signal available, which is why it can learn at your current budget. Deeper events fire too rarely to teach anything this fast.",
    },
    {
      days: "Days 7 to 10",
      title: "Qualified leads start coming in",
      body: "Wrong-fit traffic stops at the gate and never becomes a lead record. We read what is getting through with you and tighten the questions and the bar while the spend is still small.",
      note: EXPECTED_NOTE,
    },
    {
      days: "Days 11 to 15",
      title: "Appointment booking",
      body: "Qualified leads book themselves into your calendar. Your half is working the ones who booked, and chasing the qualified ones who did not. We stay on the funnel and the ad account while you do.",
    },
    {
      days: "Days 15 to 21",
      title: "Sales calls, and your first close",
      body: "You run the calls. We look at how the people who booked and bought actually answered, and feed that back into the scoring. Then we keep going, because an ad account needs about a month before a before and after comparison means anything.",
    },
  ],

  askInReturn: {
    heading: "What we ask in return",
    body: "Two things, and neither of them is a review. First, 100 visitors through the funnel, so there is enough data to read. Second, your numbers at day 30: cost per lead, cost per qualified lead, and cost per booked call, before and after. If you want to write about it afterwards we would be glad, but it is not a condition.",
  },

  // Superseded by `cost` and `entry` for this offer. Empty rather than deleted: the
  // type keeps them for the archive, and a closed offer renders from them.
  terms: [],
  preconditions: [],

  applyHref: "/build",
  applyLabel: "Apply for the founders offer",
  applyNote:
    "One question first, one tap, and nothing you have to look up. The numbers come after that, and you can finish them with your ad account open in front of you. About five minutes.",
  applyFollowUp:
    "We read every one and come back on whether the fit is there and which slot you are in.",
  countsSlots: true,
  slotCounterThreshold: 12,
  closesOn: CLOSES_ON,

  // Derived, never hand-maintained: a TODO list that can disagree with the values it
  // describes is worse than none, because it is read as authoritative.
  todos: [
    CLOSES_ON
      ? null
      : "COHORT 1 CLOSING DATE. Set CLOSES_ON in lib/marketing/offers.ts (YYYY-MM-DD, IST). The slots line then prints the closing date, and this page closes itself when it passes.",
    BUILDER
      ? null
      : "WHO IS DOING THE BUILD. A first name, a role, and one line on what they have built. Set BUILDER in lib/marketing/offers.ts. Until then the section does not render at all.",
    EXPECTED
      ? null
      : "DAY 10 EXPECTATIONS. Clicks a day, percent stopped at the gate, qualified leads a day. Set EXPECTED in lib/marketing/offers.ts. Until then the stage says only that the figures are worked out on day 5, which is true.",
    "THE FIVE GATE-ONLY INSTALLS. Undecided whether the page says out loud that 5 of the 20 slots keep their existing landing page and campaigns. Nothing on the page claims it either way.",
  ].filter((t): t is string => t !== null),
};

/** Newest first. The page renders them in this order. */
export const OFFERS: ReadonlyArray<Offer> = [FOUNDERS];

export const openOffers = (): Offer[] => OFFERS.filter((o) => o.status === "open");
export const closedOffers = (): Offer[] => OFFERS.filter((o) => o.status === "closed");

/**
 * Has the application window passed?
 *
 * Compared as an IST calendar date and inclusive of the closing day: somebody applying
 * at 11pm on the last day is inside the window, and a UTC comparison would have shut
 * the page on them five and a half hours early.
 */
export function offerClosed(offer: Offer, now: Date = new Date()): boolean {
  if (offer.status === "closed") return true;
  if (!offer.closesOn) return false;
  const istToday = new Date(now.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return istToday > offer.closesOn;
}

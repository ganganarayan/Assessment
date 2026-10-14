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
// ============================================================================

export type OfferStatus = "open" | "closed";

/** One row of an offer's day-by-day plan. */
export type OfferStage = {
  /** The window, in the words a reader counts in: "Day 6", "Days 7 to 10". */
  days: string;
  title: string;
  body: string;
};

/**
 * Something the applicant must already have.
 *
 * These are listed on the page as prominently as the offer itself, because every one
 * of them is a thing that, missing, burns days off a clock that does not stop. The
 * ad account in particular: business verification is Meta's queue, not ours.
 */
export type OfferPrecondition = { title: string; body: string };

export type Offer = {
  slug: string;
  status: OfferStatus;
  /** Small label above the name. */
  eyebrow: string;
  /** The offer's name, as a heading. */
  name: string;
  /** The whole offer in one sentence, and the only line that has to be read. */
  promise: string;
  /** What the support actually does, in prose. */
  paras: readonly string[];
  /** The hard limits. Listed, not buried in the prose, so nothing is implied. */
  terms: readonly string[];
  /** The plan both sides work to. */
  stages: readonly OfferStage[];
  preconditions: readonly OfferPrecondition[];
  /**
   * Where an application goes.
   *
   * 🔴 Never the trial call to action. The offer page deliberately carries no trial
   * link (see app/offers/page.tsx): somebody who reads this page and wants it should
   * land in the intake form where we can see whether the preconditions are met,
   * rather than self-serving a trial that the 21 days then run out of.
   */
  applyHref: string;
  applyLabel: string;
  /**
   * Whether the live remaining-slots counter belongs on this offer.
   *
   * Only true for offers whose cap is the same cap the counter tracks (the
   * done-for-you build allowance). An offer with a cap of its own would need its own
   * count, and showing an unrelated number next to it would be a lie with arithmetic
   * in it.
   */
  countsSlots: boolean;
  /** Shown in place of the call to action once status is "closed". */
  closedNote?: string;
};

const FOUNDERS: Offer = {
  slug: "founders",
  status: "open",
  eyebrow: "Founders offer",
  name: "We onboard your first paying client with you",
  promise:
    "The first 20 people onboarded get support to land their first paying client. We set your whole funnel up with you inside the trial, free, for up to 21 days.",
  paras: [
    "This is not a template and a handover note. Somebody from here is in the build with you: the assessment and its gate, the landing page it sits behind, the pixel and the Conversions API, the exclusion and retargeting audiences, and the campaigns you launch on day 6.",
    "The clock is the trial. 21 days from first call to first close, against a day-by-day plan both sides work to. Everything gets built in your own workspace and your own ad account, so all of it stays yours when the 21 days are up.",
  ],
  terms: [
    "First 20 onboarded accounts only.",
    "Free. The support is part of the trial, there is nothing extra to buy to get it.",
    "Capped at 21 days from day 1, so the build starts when you are ready for it to.",
    "Ad spend is yours and is not included. Plan for at least ₹1,000 a day from day 6.",
    "Closing is yours. We build the funnel and run the ads with you, you take the sales calls.",
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
    },
    {
      days: "Day 6",
      title: "Ads launch",
      body: "Campaigns go live on a minimum of ₹1,000 a day. Below that the auction never sees enough qualified leads to learn what one looks like, and the whole mechanism this product sells has nothing to work with.",
    },
    {
      days: "Days 7 to 10",
      title: "Qualified leads start coming in",
      body: "Wrong-fit traffic stops at the gate and never becomes a lead record. We read what is getting through with you and tighten the questions and the bar while the spend is still small.",
    },
    {
      days: "Days 11 to 15",
      title: "Appointment booking",
      body: "Your half of the work: you call the qualified leads and book them in. We stay on the funnel and the ad account while you do.",
    },
    {
      days: "Days 15 to 21",
      title: "Sales calls, and your first close",
      body: "You run the calls and close. We look at how the people who booked and bought actually answered, and feed that back into the scoring, so the next week of spend buys more of them.",
    },
  ],
  preconditions: [
    {
      title: "An offer that is ready to sell",
      body: "Something a client can pay you for this month, at a price you can say out loud. We qualify leads for your offer. We do not invent the offer.",
    },
    {
      title: "Your questions, or a template",
      body: "Bring the questionnaire you already qualify people with. If you do not have one, start from a template assessment with a gate and we tune it with you on the setup days.",
    },
    {
      title: "The pages and tools around it",
      body: "A product landing page, an opt-in form, a calendar, and a plan for Zoom or whichever video call tool you take sales calls on.",
    },
    {
      title: "Meta, set up and clean",
      body: "An ad account, a verified business manager, your Pixel ID and a Conversions API token. This is the one precondition that is somebody else's queue, so get it done before day 1 rather than during it.",
    },
  ],
  applyHref: "/build",
  applyLabel: "Apply for the founders offer",
  countsSlots: true,
};

/** Newest first. The page renders them in this order. */
export const OFFERS: ReadonlyArray<Offer> = [FOUNDERS];

export const openOffers = (): Offer[] => OFFERS.filter((o) => o.status === "open");
export const closedOffers = (): Offer[] => OFFERS.filter((o) => o.status === "closed");

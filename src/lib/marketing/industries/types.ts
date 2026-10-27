// ============================================================================
//  By-industry pages: the types, and the two tunables the arithmetic turns on.
// ============================================================================
//
//  🔴 A LEAF MODULE. It imports nothing but types, and it must stay that way.
//
//  The leak calculator is a client component, and it needs RECLAIM_SHARE and
//  WRONG_FIT_BANDS. When those lived in the same module as the page copy, every
//  industry's full spec was pulled into the browser bundle on every page that
//  rendered the calculator. With two industries that was waste; with twenty-one
//  it would be a hundred kilobytes of other industries' sales copy shipped to a
//  reader who asked for one page. The constants live here, the words live in the
//  spec files, and the client only ever reaches this file.

import type { TemplateCategory } from "@/features/templates/schema";

/**
 * How many of every hundred enquiries can never buy, as a band.
 *
 * A band rather than a free number: nobody knows their wrong-fit percentage,
 * everybody knows whether it is most of them or about half. The band prefills a
 * number input the visitor can then override, so the honest answer and the exact
 * answer both have a path.
 */
export const WRONG_FIT_BANDS = [
  { id: "most", label: "Most of them", pct: 75 },
  { id: "two-thirds", label: "About two in three", pct: 65 },
  { id: "half", label: "About half", pct: 50 },
  { id: "third", label: "About one in three", pct: 33 },
] as const;

export type WrongFitBandId = (typeof WRONG_FIT_BANDS)[number]["id"];

/**
 * 🔴 THE ONE MODELLED ASSUMPTION ON THESE PAGES, AND IT IS DELIBERATELY LOW.
 *
 * Of the ad spend currently buying traffic that can never buy, the model
 * reclaims this share and no more. An exclusion audience never catches everyone,
 * a qualified-only conversion event spends a fortnight learning, and some of that
 * budget was always going to be wasted. Claiming all of it would make the number
 * bigger and the page worthless in front of somebody who runs ad accounts for a
 * living.
 *
 * Named, exported, and printed in the footnote under the result, so a reader can
 * disagree with it explicitly rather than suspect it quietly.
 */
export const RECLAIM_SHARE = 0.4;

/** Every audience with a page of its own. The slug is the key is the URL. */
export type IndustryKey =
  | "study-abroad"
  | "clinics"
  | "b2b-saas"
  | "coaches"
  | "agencies"
  | "consultants"
  | "course-creators"
  | "financial-advisers"
  | "law-firms"
  | "it-services"
  | "home-services"
  | "insurance-brokers"
  | "real-estate"
  | "healers"
  | "astrologers"
  | "interior-design"
  | "franchise"
  | "solar-ev"
  | "webinars"
  | "recruiters"
  | "inbound-travel";

/**
 * The leak calculator: before the gate, and after it.
 *
 * It measures MONEY, not minutes. An earlier version costed the staff hours
 * spent disqualifying, which is true, small, and recognised by nobody: an owner
 * reads "39 hours a month" and feels nothing, because those people are salaried
 * and were going to be at work anyway. What hurts is the ad spend that bought
 * people who could never buy, and the sales that budget could have bought
 * instead.
 *
 * Defaults are a plausible mid-size business in that industry, not a flattering
 * one, and they are quoted in RUPEES. A dollar reader sees them converted at the
 * rate named in currency.ts, because every figure that matters is derived from
 * what the visitor types over the top of them.
 */
export type IndustryLeakSpec = {
  heading: string;
  lead: string;
  enquiriesLabel: string;
  enquiriesDefault: number;
  /** Their real monthly outcome count, so the close rate is theirs, not ours. */
  outcomesLabel: string;
  outcomesDefault: number;
  /** Currency-free: the calculator appends "in rupees" or "in dollars" itself. */
  valueLabel: string;
  valueHint: string;
  /** In rupees, always. Converted for display. */
  valueDefault: number;
  spendLabel: string;
  spendHint: string;
  /** In rupees, always. Converted for display. */
  spendDefault: number;
  wrongFitLegend: string;
  wrongFitLabel: string;
  wrongFitHint: string;
  wrongFitDefaultBand: WrongFitBandId;
  /** The noun for one enquiry, singular, used inside the working. */
  unit: string;
  /** The noun for one sale, singular and plural, used inside the working. */
  outcomeUnit: string;
  outcomeUnitPlural: string;
  beforeHeading: string;
  afterHeading: string;
  /**
   * The short, visible note under the result.
   *
   * Carries NO figures, deliberately. Every number in it would have to be kept
   * in step with four inputs the visitor is changing as they read, and a
   * paragraph quoting a stale total next to a live one is worse than no
   * paragraph.
   */
  assumptions: string;
  /** The why behind the reclaim share. Lives inside the folded arithmetic. */
  reclaimNote: string;
  caughtHeading: string;
  caught: ReadonlyArray<{ title: string; body: string }>;
};

export type IndustrySpec = {
  key: IndustryKey;
  path: string;
  /** The label in the footer's By industry list. */
  shortName: string;
  /**
   * The template library category this page speaks to.
   *
   * Typed against the library's own union, so the home page can turn a category
   * name in that grid into a link to this page and a renamed category breaks the
   * build rather than the link. verify:industries asserts the mapping is total.
   */
  category: TemplateCategory;
  /**
   * The `lead-qualification-for-x` keyword page covering the same audience, when
   * one exists.
   *
   * The two are not duplicates: a keyword page answers a search, an industry
   * page is where an emailed funnel audit lands. But the footer must not list
   * the same audience twice under By industry, so naming the twin here is what
   * lets that column drop it.
   */
  keywordSlug: string | null;
  /**
   * Gets a card of its own on the home page.
   *
   * Reserved for the audiences ads and email actually point at. Every industry
   * is reachable from the category grid below those cards; featuring all of
   * twenty-one would turn the section into a wall of identical green boxes and
   * tell a visitor nothing about where to start.
   */
  featured: boolean;
  /** One short line, for the featured cards in "Who it is for". */
  cardLine: string;
  meta: { title: string; description: string };
  hero: { headline: string; sub: string };
  inbox: { heading: string; body: string; cold: string };
  leak: IndustryLeakSpec;
  research: { heading: string; claim: string; method: string; soWhat: string };
  mechanism: {
    heading: string;
    lead: string;
    gate: string;
    score: string;
    signal: string;
    signalPoints: ReadonlyArray<string>;
  };
  after: {
    heading: string;
    lead: string;
    steps: ReadonlyArray<{ n: string; title: string; body: string }>;
    note: string;
  };
  fit: {
    heading: string;
    lead: string;
    forList: ReadonlyArray<string>;
    notList: ReadonlyArray<string>;
    close: string;
  };
  objections: ReadonlyArray<{ q: string; a: string }>;
  /** RevenueOS CRM. One sentence, no link, no second call to action. */
  crmLine: string;
  finalCta: { heading: string; sub: string };
};

// ============================================================================
//  The by-industry registry. One spec per audience, one file each.
// ============================================================================
//
//  This was a single module holding every industry's copy. Two industries fitted;
//  twenty-one would not, and the shared sentences would have been restated
//  twenty-one times and drifted. So the types and the two tunables live in
//  ./types, the sentences that describe the PRODUCT live in ./define, and each
//  file here holds only what belongs to one reader.
//
//  Every import path that existed before still resolves: this module re-exports
//  the types, the bands, the reclaim share and the eyebrow, so `from
//  "@/lib/marketing/industries"` means what it always meant.

import { AGENCIES } from "./agencies";
import { ASTROLOGERS } from "./astrologers";
import { B2B_SAAS } from "./b2b-saas";
import { CLINICS } from "./clinics";
import { COACHES } from "./coaches";
import { CONSULTANTS } from "./consultants";
import { COURSE_CREATORS } from "./course-creators";
import { FINANCIAL_ADVISERS } from "./financial-advisers";
import { FRANCHISE } from "./franchise";
import { HEALERS } from "./healers";
import { HOME_SERVICES } from "./home-services";
import { INBOUND_TRAVEL } from "./inbound-travel";
import { INSURANCE_BROKERS } from "./insurance-brokers";
import { INTERIOR_DESIGN } from "./interior-design";
import { IT_SERVICES } from "./it-services";
import { LAW_FIRMS } from "./law-firms";
import { REAL_ESTATE } from "./real-estate";
import { RECRUITERS } from "./recruiters";
import { SOLAR_EV } from "./solar-ev";
import { STUDY_ABROAD } from "./study-abroad";
import { WEBINARS } from "./webinars";
import type { IndustryKey, IndustrySpec } from "./types";

export { INDUSTRY_EYEBROW } from "./define";
export { RECLAIM_SHARE, WRONG_FIT_BANDS } from "./types";
export type { IndustryKey, IndustryLeakSpec, IndustrySpec, WrongFitBandId } from "./types";

/**
 * Every industry page, in the order the footer and the home page read them.
 *
 * Authored order, not alphabetical: the audiences the business actively points
 * ads and email at come first, and the rest follow. Alphabetical would put
 * Agencies above the two pages the whole campaign currently runs to.
 */
export const INDUSTRY_PAGES: ReadonlyArray<IndustrySpec> = [
  // The campaign destinations, and the only ones featured on the home page.
  STUDY_ABROAD,
  CLINICS,
  B2B_SAAS,
  COACHES,
  AGENCIES,
  // High-ticket services: the enquiry costs senior time before anybody pays.
  CONSULTANTS,
  IT_SERVICES,
  LAW_FIRMS,
  FINANCIAL_ADVISERS,
  INTERIOR_DESIGN,
  RECRUITERS,
  // High-volume funnels: the ratio of enquiries to sales is the whole argument.
  REAL_ESTATE,
  HOME_SERVICES,
  INSURANCE_BROKERS,
  SOLAR_EV,
  FRANCHISE,
  INBOUND_TRAVEL,
  // Information and practice businesses, where the product is hours or seats.
  COURSE_CREATORS,
  WEBINARS,
  HEALERS,
  ASTROLOGERS,
];

/** The spec for a key that is known to exist. Throws if the registry disagrees. */
export function getIndustry(key: IndustryKey): IndustrySpec {
  const spec = INDUSTRY_PAGES.find((p) => p.key === key);
  // A throw beats a non-null assertion: if the union and the array ever disagree,
  // this says which key was asked for.
  if (!spec) throw new Error(`Unknown industry page: ${key}`);
  return spec;
}

/**
 * The spec for an arbitrary URL segment, or undefined.
 *
 * What the dynamic route needs. Separate from getIndustry on purpose: a bad
 * segment in a URL is a 404 and an everyday event, while a key in the union with
 * no spec behind it is a bug and should be loud.
 */
export function findIndustry(segment: string): IndustrySpec | undefined {
  return INDUSTRY_PAGES.find((p) => p.key === segment);
}

/** Industry pages that get a card of their own on the home page. */
export const FEATURED_INDUSTRIES: ReadonlyArray<IndustrySpec> = INDUSTRY_PAGES.filter(
  (p) => p.featured,
);

/**
 * Template-library category name to industry page path.
 *
 * The home page lists the library's categories as a plain grid of names. This is
 * what lets a name in that grid become a link to the page written for it, so
 * every audience the product advertises is reachable rather than only the
 * featured few.
 */
export const INDUSTRY_BY_CATEGORY: ReadonlyMap<string, IndustrySpec> = new Map(
  INDUSTRY_PAGES.map((p) => [p.category as string, p]),
);

/**
 * Keyword-page slugs that an industry page already covers.
 *
 * The footer's By industry column lists the industry pages and then the
 * `lead-qualification-for-x` keyword pages. Both exist on purpose, and both are
 * in the sitemap, but listing the same audience twice in one column reads as a
 * mistake. The industry page wins there, and the keyword page is still reachable
 * from search, from its own internal links and from the sitemap.
 */
export const INDUSTRY_KEYWORD_SLUGS: ReadonlySet<string> = new Set(
  INDUSTRY_PAGES.map((p) => p.keywordSlug).filter((s): s is string => s !== null),
);

/**
 * The By industry list in the footer, in the order it renders.
 *
 * Industry pages come first and render emphasised. After them come the keyword
 * pages in a chosen order rather than registry order, since the registry is
 * sorted by when each page was written and the footer should lead with the
 * industries that matter commercially.
 *
 * Slugs NOT listed here still render, in registry order, after the ones that
 * are: the failure mode of a hand-kept list is a page that silently leaves the
 * site's only navigation, and nothing errors when it does.
 */
export const BY_INDUSTRY_LEAD_SLUGS: ReadonlyArray<string> = [
  "lead-qualification-for-real-estate",
  "lead-qualification-for-it-services",
  "lead-qualification-for-law-firms",
];

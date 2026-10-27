// ============================================================================
//  The shared half of every by-industry page, written once.
// ============================================================================
//
//  Two industries could restate the mechanism, the four steps and the footnotes
//  in their own files and stay in step by luck. Twenty-one cannot. Every sentence
//  that is true of the PRODUCT rather than of the industry lives here, and a spec
//  file supplies only the words that belong to its reader: the hero, the nouns,
//  what a gate would have caught, the objections, the fit lists and the numbers.
//
//  The same principle the original file opened with, one level up: the offer, the
//  slot count and the call to action are read from content.ts rather than restated,
//  because a figure typed into a page is a figure that will eventually disagree
//  with the one in the announcement bar above it. The mechanism is now in that
//  category too.
//
//  🔴 Nothing in here may describe a service. Assess360 is software the customer
//  operates: no done-for-you marketing, no retainer, no leads sold by the piece.
//  The one thing we do for them is build the first scorecard with them on a call.
//
//  🔴 And nothing in here may claim a feature. The claim set is fixed: a gate that
//  runs before the opt-in, scoring on the variables that decide the sale, an
//  exclusion event on every disqualification, a qualified-only conversion event,
//  and the Meta Conversions API. Twenty-one pages is twenty-one chances to invent
//  a capability that does not ship, so the sentences that make claims are here,
//  shared, and an industry file cannot reach them.

import { HERO, OFFER_SLOTS } from "../content";
import { RECLAIM_SHARE, type IndustryLeakSpec, type IndustrySpec } from "./types";

/** The eyebrow is the category, and it is the same category on every page. */
export const INDUSTRY_EYEBROW = HERO.eyebrow;

/**
 * The category finding, written once.
 *
 * Stated as an OBSERVATION from reading live ads, with the method named and the
 * check handed to the reader, because that is what it is. A round number dressed
 * up as research is the fastest way to lose a sceptical operator, and this one
 * happens to be checkable in the Meta Ad Library in an afternoon.
 */
const RESEARCH_METHOD =
  "That is an observation from reading live Meta ads in this category, not a statistic we commissioned. Open the Meta Ad Library, search your own competitors, and click through to what the ad actually delivers. An afternoon is enough to confirm or break it.";

/** RevenueOS gets one sentence on these pages. Not a section, not a link. */
const CRM_LINE =
  "Qualified leads can flow into RevenueOS CRM later if you want them there, and nothing on this page needs it.";

/** The step that closes every page's "what happens" list. */
const AFTER_NOTE = `The build is free for the first ${OFFER_SLOTS}, and the 30-minute call is how it goes live. You keep the account, the scorecard and the ad audiences afterwards.`;

/** Step 03 is the same call in every industry, because it is the same call. */
const CALL_STEP =
  "We set your workspace up, lay the scorecard in, tweak the gate with you, connect your Meta pixel and the Conversions API, and build the exclusion and retargeting audiences in your ad account.";

const plural = (unit: string) => (unit.endsWith("y") ? `${unit.slice(0, -1)}ies` : `${unit}s`);
const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * What an industry file actually writes.
 *
 * Read the field comments as a brief. Everything here is either a noun this
 * industry uses for its own people and money, or a paragraph only somebody who
 * knows the industry could write. If a field looks like it could be the same in
 * two industries, it belongs in the shared copy above instead.
 */
export type IndustryInput = {
  key: IndustrySpec["key"];
  shortName: string;
  category: IndustrySpec["category"];
  keywordSlug: string | null;
  featured?: boolean;
  cardLine: string;
  meta: IndustrySpec["meta"];
  hero: IndustrySpec["hero"];
  /**
   * The distance the money falls down, lower case, as a noun phrase:
   * "the gap between the enquiry and the chair".
   *
   * One input, two uses: it titles the leak section and it is the thing the
   * emailed audit is said to have measured. They cannot disagree.
   */
  gap: string;
  /** Plural noun for the business itself: "clinics", "consultancies", "firms". */
  businesses: string;
  /** How a competitor is described: "clinics down the road", "your competitors". */
  rivals: string;
  /** What their category's ads promise: "an assessment, a suitability check". */
  promiseWords: string;
  /** Plural noun for the buyer, used in the reclaim footnote: "patients". */
  gainNoun: string;
  /** The verb that ends the wrong-fit question: "can never book". */
  neverVerb: string;
  leak: Pick<
    IndustryLeakSpec,
    | "lead"
    | "enquiriesLabel"
    | "enquiriesDefault"
    | "outcomesLabel"
    | "outcomesDefault"
    | "valueLabel"
    | "valueHint"
    | "valueDefault"
    | "spendDefault"
    | "wrongFitHint"
    | "wrongFitDefaultBand"
    | "unit"
    | "outcomeUnit"
    | "outcomeUnitPlural"
  > & {
    spendHint?: string;
    /**
     * Two entries, not three. The middle one, the ads learning to stop buying
     * them, is the product rather than the industry and is filled in below.
     */
    caught: readonly [{ title: string; body: string }, { title: string; body: string }];
  };
  mechanism: {
    gate: string;
    score: string;
    /** The one sentence that says what qualification alone saves them. */
    signalOpener: string;
    /** "the students who will never qualify". */
    neverNoun: string;
    /** "a student with funds and an intake". */
    goodShape: string;
    /** "somebody who fills in forms". */
    badShape: string;
    /** What the campaign starts optimising toward, inside caught[1]. */
    optimisesToward: string;
  };
  /** The trade, named in their own metrics: cost per enquiry up, cost per X down. */
  costPer: { before: string; after: string };
  after: {
    /** What they send us. */
    brief: string;
    /** What we draft from it. */
    scorecard: string;
    /** What we explicitly do not do in this industry. One or two sentences. */
    notOurJob: string;
  };
  fit: { forList: ReadonlyArray<string>; notList: ReadonlyArray<string> };
  objections: IndustrySpec["objections"];
  finalCta: IndustrySpec["finalCta"];
};

/** Fill the shared half, keep the industry's own half, and type-check the join. */
export function defineIndustry(input: IndustryInput): IndustrySpec {
  const { leak, mechanism } = input;
  const units = plural(leak.unit);

  return {
    key: input.key,
    path: `/industries/${input.key}`,
    shortName: input.shortName,
    category: input.category,
    keywordSlug: input.keywordSlug,
    featured: input.featured ?? false,
    cardLine: input.cardLine,
    meta: input.meta,
    hero: input.hero,
    inbox: {
      heading: "If the audit landed in your inbox",
      body: `The one-page audit of your enquiry flow came from us. This page is the rest of it: what ${input.gap} costs you, the three steps that close it, and what happens on the call.`,
      cold: "Never got one, and arrived here cold? Nothing below depends on it. The arithmetic runs on numbers you type in yourself.",
    },
    leak: {
      heading: sentence(input.gap),
      lead: leak.lead,
      enquiriesLabel: leak.enquiriesLabel,
      enquiriesDefault: leak.enquiriesDefault,
      outcomesLabel: leak.outcomesLabel,
      outcomesDefault: leak.outcomesDefault,
      valueLabel: leak.valueLabel,
      valueHint: leak.valueHint,
      valueDefault: leak.valueDefault,
      spendLabel: "What you spend on ads a month",
      spendHint: leak.spendHint ?? "Meta and Google together, the figure your card is charged.",
      spendDefault: leak.spendDefault,
      wrongFitLegend: `Of those ${units}, how many ${input.neverVerb}?`,
      wrongFitLabel: `Of every 100 ${units}, how many ${input.neverVerb}?`,
      wrongFitHint: leak.wrongFitHint,
      wrongFitDefaultBand: leak.wrongFitDefaultBand,
      unit: leak.unit,
      outcomeUnit: leak.outcomeUnit,
      outcomeUnitPlural: leak.outcomeUnitPlural,
      beforeHeading: "Today, with no gate",
      afterHeading: "After the gate and the signal",
      assumptions: `Two things decide these figures, and both are yours. Your close rate is not an industry average, it is worked out from what you entered above: your ${leak.outcomeUnitPlural} against your own qualified ${units}. And only part of the wasted budget is counted as recoverable, never all of it. Change any number above and everything here moves with it.`,
      reclaimNote: `Only ${Math.round(
        RECLAIM_SHARE * 100,
      )} percent of the wasted spend is counted as recoverable. An exclusion audience never catches everyone, and a qualified-only conversion event spends a fortnight learning before it changes who your ads reach. Extra ${
        input.gainNoun
      } are priced at what a qualified ${leak.unit} costs you today, your whole ad spend divided by the qualified ${units} it produced, not at the cheaper blended rate.`,
      caughtHeading: "What a gate would have caught",
      caught: [
        leak.caught[0],
        {
          title: "Your ads stop buying more of them.",
          body: `Every disqualified visitor fires an exclusion event, so Meta builds a never-show-again audience. Every qualified completion reports as its own conversion, so the campaign optimises toward ${mechanism.optimisesToward}.`,
        },
        leak.caught[1],
      ],
    },
    research: {
      heading: "What we found across the category",
      claim: `Of the advertisers in this category whose ad copy promises ${input.promiseWords}, roughly nine in ten deliver a plain contact form, a Meta instant form, a Google Form or a WhatsApp link instead. Nothing is scored. Nobody is turned away.`,
      method: RESEARCH_METHOD,
      soWhat: `So the promise is already being made in your market, by ${input.rivals}, in their own ads. It is the delivery that is missing, and the delivery is the part that qualifies.`,
    },
    mechanism: {
      heading: "Gate, then Score, then Signal",
      lead: "Three steps, in that order. The third is the one no other assessment tool has.",
      gate: mechanism.gate,
      score: mechanism.score,
      signal: `${mechanism.signalOpener} This saves your ad budget, and nothing else in the category does it. Meta optimises toward whatever you report as a conversion, and today you are reporting form-fills, which is exactly what it keeps finding you.`,
      signalPoints: [
        `Every disqualified ${leak.unit} fires an exclusion event, so one Meta audience holds ${mechanism.neverNoun} and your ad never reaches them again.`,
        `Every qualified completion reports as its own conversion event, so the algorithm learns the shape of ${mechanism.goodShape} rather than the shape of ${mechanism.badShape}.`,
        `${input.costPer.before} will go up. ${input.costPer.after} is the number that falls, and that is the trade you are making on purpose.`,
      ],
    },
    after: {
      heading: "What happens after you ask",
      lead: "Four steps, and you are in the room for the one that matters.",
      steps: [
        { n: "01", title: "You send a short brief", body: input.after.brief },
        { n: "02", title: "We write the scorecard", body: input.after.scorecard },
        { n: "03", title: "One 30-minute call", body: CALL_STEP },
        {
          n: "04",
          title: "It goes live before you hang up",
          body: `You operate it from then on. ${input.after.notOurJob} Nothing in your funnel depends on us being available.`,
        },
      ],
      note: AFTER_NOTE,
    },
    fit: {
      heading: "Who this is for, and who it is not",
      lead: `This turns ${leak.unit} volume down on purpose. For some ${input.businesses} that is the wrong trade, and it is cheaper for both of us to say so here.`,
      forList: input.fit.forList,
      notList: input.fit.notList,
      close:
        "If that is you today, close the tab with the arithmetic above. It stays true whether or not you ever buy anything.",
    },
    objections: input.objections,
    crmLine: CRM_LINE,
    finalCta: input.finalCta,
  };
}

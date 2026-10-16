"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  startSubmission,
  completeSubmission,
  requestPreviousResults,
  saveDraftAnswers,
} from "@/features/assessment/actions/submission";
import { recordOptinView, recordGatePass, recordGateDisqualification, recordOptinSeen } from "@/features/assessment/actions/track";
import { evaluateGate } from "@/features/assessment/actions/gate-route";
import { gateFlagKey, readGateRejection, writeGateRejection } from "@/lib/gate-flag";
import { firstStep, afterGateStep, type EntryInput } from "@/features/assessment/flow/entry";
import {
  splitIsActive,
  splitFirstStep,
  splitNextStep,
  nameScreenFields,
  type LeadSplitInput,
  type SplitStep,
} from "@/features/assessment/flow/lead-split";
import { type SplitLeadHandle } from "@/features/assessment/flow/lead-split-io";
import { captureSplitLead } from "@/features/assessment/actions/lead-split";
import { normalizePhone, isValidEmail, EMAIL_ERROR } from "@/lib/lead-format";
import { getResultForPages, type PageResultData } from "@/features/assessment/actions/pages";
import { type AssessmentPageData } from "@/features/assessment/pages/blocks";
import { openRazorpayCheckout } from "@/lib/payments/checkout-client";
import { type PaymentCheckout } from "@/lib/payments/types";
import { ResultPages } from "@/features/assessment/components/public/result-pages";
import {
  type LeadInput,
  professionOptionsFor,
  completionEventName,
  FREE_TEXT_ANSWER_MAX,
  type PreResultField,
} from "@/features/assessment/schemas";
import { pixelTrack, pixelTrackCustom } from "@/lib/pixel";
import { getOrCreateExternalId } from "@/lib/external-id";
import { currentAdParams } from "@/lib/attribution-client";
import { appendVidapulseId } from "@/lib/vidapulse";
import { detectUnitFromQuestion, isClinicRole, type ClinicRole } from "@/lib/scoring/clinic-audit";
import {
  buildSpine,
  hasRouting,
  nextIndex,
  walk,
  type RouteSpec,
} from "@/lib/routing/engine";
import { waitSeconds, terminalStage, type FlowInput } from "@/features/assessment/flow/stages";
import { STAGE_DEFAULTS, optinCopy } from "@/features/assessment/flow/stage-defaults";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatISTDate } from "@/lib/date";

export interface PublicOption {
  id: string;
  label: string;
  value: number;
  /** Conditional-routing rule for this option (null = default linear NEXT). */
  route?: RouteSpec | null;
}
export interface PublicQuestion {
  id: string;
  text: string;
  /** SINGLE_SELECT = pick an option (scored). FREE_TEXT = type a sentence: no options,
   *  no score, and routing falls to the question's default route. */
  type: "SINGLE_SELECT" | "FREE_TEXT";
  required: boolean;
  /** CLINIC_AUDIT only: the funnel role this question feeds, e.g. "ENQUIRIES". Drives
   *  the optional "know your actual number?" field below the range choice. */
  scoringRole: string | null;
  scoringUnit: string | null;
  /** Where this question leads when no option rule applies - it was skipped, it is
   *  typed, or the chosen option carries no rule. Null = continue linearly. */
  defaultRoute?: RouteSpec | null;
  options: PublicOption[];
}

/** CLINIC_AUDIT numeric roles a respondent might know an exact figure for - the
 *  "actual number" field renders below the range choice for these only. Excludes
 *  UPLIFT_BOOKRATE (behavioral - response speed/follow-up - not a number to type). */
const CLINIC_ACTUAL_FIELD: Record<string, { prompt: string; placeholder: string }> = {
  ENQUIRIES: { prompt: "Know your actual monthly enquiries?", placeholder: "e.g. 42" },
  BOOK_RATE: { prompt: "Know your actual booking rate?", placeholder: "e.g. 27" },
  SHOWUP_RATE: { prompt: "Know your actual show-up rate?", placeholder: "e.g. 7" },
  CLOSE_RATE: { prompt: "Know your actual close rate?", placeholder: "e.g. 3" },
  TREATMENT_VALUE: { prompt: "Know your actual average treatment value?", placeholder: "e.g. 95000" },
  AD_SPEND: { prompt: "Know your actual monthly ad spend?", placeholder: "e.g. 42000" },
  DORMANT: { prompt: "Know your actual dormant list size?", placeholder: "e.g. 620" },
  CAPACITY: { prompt: "Know your actual spare capacity?", placeholder: "e.g. 8" },
};

/** The unit a question's numbers are in. Uses the SAME inference as the scoring
 *  engine, so what the field asks for is exactly what gets scored. */
function unitForQuestion(q: PublicQuestion): string {
  if (q.scoringUnit) return q.scoringUnit;
  if (!isClinicRole(q.scoringRole ?? "")) return "COUNT";
  return detectUnitFromQuestion(
    q.scoringRole as ClinicRole,
    q.text,
    q.options.map((o) => o.value),
  );
}

/** How the field is framed for the respondent, in their own words. */
function unitAffordance(unit: string): { prefix: string | null; suffix: string | null; hint: string } {
  switch (unit) {
    case "PER_10":
      return { prefix: null, suffix: "out of 10", hint: "Enter how many out of every 10." };
    case "PER_100":
      return { prefix: null, suffix: "%", hint: "Enter it as a percentage (out of 100)." };
    case "RUPEES":
      return { prefix: "₹", suffix: null, hint: "Enter the amount in rupees." };
    default:
      return { prefix: null, suffix: null, hint: "Enter the number." };
  }
}

/** Reject an entry that can't be what they meant - the guard that would have
 *  caught "7" typed into a percentage field when the question said "out of 10". */
function actualNumberError(role: string, unit: string, raw: string): string | null {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n)) return null; // blank is fine - we use the range
  if (n <= 0) return "Enter a number greater than zero.";
  if (unit === "PER_10" && n > 10) return "This question is out of 10 - enter a number from 1 to 10.";
  if (unit === "PER_100" && n > 100) return "Enter it as a percentage - 100 or less.";
  // A percentage this low is nearly always an "out of 10" answer typed into a
  // percent field (7 meaning 7-in-10). Ask, rather than silently mis-scoring.
  if (unit === "PER_100" && (role === "SHOWUP_RATE" || role === "CLOSE_RATE") && n <= 10) {
    return `That reads as ${n}% - fewer than ${n} in every 100. If you meant ${n} out of 10, enter ${n * 10}.`;
  }
  return null;
}
export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  page: number;
  questions: PublicQuestion[];
}
export interface PublicAssessment {
  slug: string;
  title: string;
  eyebrow: string | null;
  subheadline: string | null;
  description: string | null;
  coverImageUrl: string | null;
  buttonColor: string | null;
  buttonTextColor: string | null;
  preResultHeading: string | null;
  preResultSubtext: string | null;
  preResultFields: PreResultField[];
  estimatedMinutes: number | null;
  trainingUrl: string | null;
  retakePolicy: "DELAYED" | "NEVER" | "UNLIMITED";
  retakeDays: number;
  collectFirstName: boolean;
  firstNameRequired: boolean;
  collectLastName: boolean;
  lastNameRequired: boolean;
  collectEmail: boolean;
  emailRequired: boolean;
  collectMobile: boolean;
  mobileRequired: boolean;
  collectProfession: boolean;
  professionRequired: boolean;
  professionOptions: string[];
  firstNameLabel: string | null;
  lastNameLabel: string | null;
  emailLabel: string | null;
  mobileLabel: string | null;
  professionLabel: string | null;
  professionPlaceholder: string | null;
  leadCaptureAfter: boolean;
  /** ALL_AT_ONCE = one opt-in screen (every funnel built so far). SPLIT = name, then
   *  the gate, then email, then the assessment, then phone before the result. */
  leadCaptureMode: "ALL_AT_ONCE" | "SPLIT";
  optinFields: PreResultField[];
  introNotice: string | null;
  startButtonLabel: string | null;
  /** One sentence above the opt-in form; blank renders nothing. */
  qualifiedNote: string | null;
  resultsButtonLabel: string | null;
  paidMode: boolean;
  /** Where the run ends. NO_RESULT shows the thank-you message and nothing else. */
  nextStep: "PAYMENT" | "DESTINATION" | "RESULTS" | "NO_RESULT";
  /** The closing line for an ending that shows nothing back. */
  thankYouMessage: string | null;
  /** Finish -> /sign-up prefilled, instead of a result page (platform funnel). */
  platformSignup: boolean;
  /** Anticipation countdown (seconds) after Submit before the destination/VSL loads. */
  vslCountdownSeconds: number;
  questionDisplayMode: "ALL" | "CATEGORY" | "SINGLE";
  autoAdvanceLastScreen: boolean;
  paymentHeadline: string | null;
  paymentButtonLabel: string | null;
  paymentIntroText: string | null;
  // Audience gate (Phase 2): a first screen that replaces Profession. Two modes:
  //  - DROPDOWN: pick an option; each either continues here (redirectSlug null) or
  //    redirects to another assessment's published slug (built from the admin's pick,
  //    never a hand-typed link). Options with an unpublished target are dropped.
  //  - FREETEXT: type a value, with live suggestions from the tenant's canonical
  //    list; a non-matching value is accepted as-is. `required` gates Continue.
  // Null = no gate (normal opt-in).
  audienceGate: {
    mode: "DROPDOWN" | "FREETEXT";
    label: string | null;
    placeholder: string | null;
    required: boolean;
    suggestions: string[];
    options: { key: string; label: string; redirectSlug: string | null }[];
  } | null;
  // Qualification gate (Page 1): questions shown one-at-a-time before the assessment.
  // A disqualifying answer routes to the disqualified page - no lead/submission/result.
  qualification: {
    enabled: boolean;
    /** Ask the server for a verdict after the last question. The thresholds and the
     *  points behind them never reach this page. */
    bandsEnabled: boolean;
    questions: {
      id: string;
      text: string;
      type: "choice" | "text";
      placeholder: string;
      required: boolean;
      options: { id: string; label: string; disqualifies: boolean; exitKey: string }[];
    }[];
  } | null;
  /** The exit routes. One entry for a gate built before routes existed, holding the
   *  content its single disqualified page already had. The per-exit Meta settings stay
   *  on the server - what fires is not the browser's decision to make. */
  exits: {
    key: string;
    name: string;
    mode: "PAGE" | "OPTIN" | "CONTINUE";
    heading: string;
    subtext: string;
    bodyHtml: string;
    buttonLabel: string;
    buttonUrl: string;
  }[];
  categories: PublicCategory[];
  pages: AssessmentPageData[];
}

type Step = "qualify" | "disqualified" | "gate" | "intro" | "questions" | "leadForm" | "details" | "locked" | "capLocked" | "evaluating" | "resultPages" | "thanks"
  // SPLIT lead capture only - the three staged lead screens.
  | "leadName" | "leadEmail" | "leadPhone";

/** Anticipation countdown shown after Submit before the VSL/destination loads.
 *  Single source of truth; promote to a per-assessment field if it needs to vary. */
const VSL_COUNTDOWN_SECONDS = 10;

interface Lockout {
  policy: "DELAYED" | "NEVER";
  lastCompletedAt: string | null;
  nextAvailableAt: string | null;
  /** Server-confirmed: a previous result exists and can be emailed. When false the
   *  offer is not made, instead of making it and then hedging about it. */
  resultAvailable: boolean;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  // DD-MM-YYYY, never the browser's locale: this renders for the respondent, and on a
  // US-locale phone a locale-less call puts the month first.
  return Number.isNaN(d.getTime()) ? null : formatISTDate(d);
}

export function AssessmentRunner({
  assessment,
  attribution,
  preview,
  prefill,
}: {
  assessment: PublicAssessment;
  /** UTM + click-id params from the landing URL; forwarded to startSubmission. */
  attribution?: Record<string, string>;
  /** Admin preview flag (?preview=1); server verifies the caller before bypassing. */
  preview?: boolean;
  /**
   * Name and email already known about this visitor, from a signed hand-off the server
   * verified (today: somebody arriving from a cancellation). Seeds the opt-in form and
   * stays EDITABLE - it is a courtesy, not an assertion about who is holding the phone.
   */
  prefill?: { firstName?: string; email?: string };
}) {
  // The configuration that decides where this run ends (and therefore whether the
  // post-Submit screen counts down at all). Derived once, in one place.
  const flowInput: FlowInput = {
    platformSignup: assessment.platformSignup,
    pageCount: assessment.pages.length,
    paidMode: assessment.paidMode,
    noResult: assessment.nextStep === "NO_RESULT",
    vslCountdownSeconds: assessment.vslCountdownSeconds,
  };
  // The opt-in heading and sub-line. Terminal-aware: a signup funnel has no results to
  // promise, so it must not say "to see your results".
  const optin = optinCopy(terminalStage(flowInput));
  const gate = assessment.audienceGate;
  const freeMode = gate?.mode === "FREETEXT";
  // A free-text gate shows even with no options; a dropdown needs at least one.
  const gated = !!(gate && (freeMode || gate.options.length > 0));
  // Qualification gate (Page 1): active only when enabled with at least one question.
  const qual =
    assessment.qualification && assessment.qualification.enabled && assessment.qualification.questions.length > 0
      ? assessment.qualification
      : null;
  /**
   * Did a qualification gate actually run for this respondent?
   *
   * When it did, the funnel is already under way by the time the gate is cleared, so the
   * intro's headline, subheadline and cover image are an interruption rather than an
   * opening: the person has answered several questions and then gets handed a title page.
   * So the gate's presence suppresses the landing copy and numbers the screens as two
   * sections of one run.
   *
   * Derived from `qual` rather than tracked in state, because it is a property of the
   * assessment, not of where the respondent has got to.
   */
  const gateRan = qual !== null;
  /**
   * Does this assessment have any SCORED questions at all?
   *
   * It is legitimate for it not to: a funnel can be built entirely out of qualification
   * gate questions, where the gate is the assessment and the points are earned there. But
   * the questions step was written assuming there is always something to show, and with
   * nothing to show it rendered an empty screen whose Submit button could never succeed:
   * the server requires at least one answer, rejects it, and drops the respondent back on
   * the same empty screen. An infinite loop at the end of a paid funnel, with no error
   * anybody could see.
   *
   * Counted exactly the way the screen builder counts, INCLUDING the page filter, so a
   * category sitting on a page outside {1, 2} is treated as what it is here: invisible.
   */
  const scoredQuestionCount = assessment.categories
    .filter((c) => (c.page ?? 1) === 1 || (c.page ?? 1) === 2)
    .reduce((n, c) => n + c.questions.length, 0);
  const hasScoredQuestions = scoredQuestionCount > 0;
  /**
   * The structural facts the entry rules read. Derived once, here, so the first screen
   * and the post-gate screen cannot disagree about them (scripts/verify-gate.ts pins
   * the rules themselves).
   */
  const entry: EntryInput = {
    qualificationEnabled: assessment.qualification?.enabled === true,
    qualificationQuestions: assessment.qualification?.questions.length ?? 0,
    audienceGate: gated,
    scoredQuestions: scoredQuestionCount,
    leadCaptureAfter: assessment.leadCaptureAfter,
  };
  /**
   * SPLIT lead capture: the same structural facts, read by the other order.
   *
   * The two modes genuinely run different screens in a different sequence, so they read
   * different modules rather than sharing one with a flag in it. Everything the fields
   * themselves are configured with - collect, labels, the custom opt-in fields - is the
   * same data in both, which is why switching modes loses nothing.
   */
  const splitInput: LeadSplitInput = {
    splitMode: assessment.leadCaptureMode === "SPLIT",
    collectFirstName: assessment.collectFirstName,
    collectLastName: assessment.collectLastName,
    collectEmail: assessment.collectEmail,
    collectMobile: assessment.collectMobile,
    collectProfession: assessment.collectProfession,
    audienceGate: gated,
    qualificationLive: qual !== null,
    scoredQuestions: scoredQuestionCount,
    optinFieldCount: assessment.optinFields.length,
    preResultFieldCount: assessment.preResultFields.length,
  };
  const splitActive = splitIsActive(splitInput);

  // The first screen. The gate decides whether this person is worth a lead row, so
  // nothing that creates one may precede it. In SPLIT the name screen comes before the
  // gate, which is safe only because what is typed there is written nowhere until the
  // email arrives - after the verdict.
  const [step, setStep] = useState<Step>(() =>
    splitActive ? ((splitFirstStep(splitInput) ?? "leadEmail") as Step) : firstStep(entry),
  );
  /** The lead row written at the email screen: the cid that joins it to the submission,
   *  and the token the phone screen must present to complete it. */
  const [splitHandle, setSplitHandle] = useState<SplitLeadHandle | null>(null);
  // Current qualification question index (one at a time, auto-advance).
  const [qualIndex, setQualIndex] = useState(0);
  // Answers to qualification TEXT questions (keyed by question id) - manual review.
  const [qualTextAnswers, setQualTextAnswers] = useState<Record<string, string>>({});
  // Which option the respondent picked on each gate question, by question id. Only the
  // IDS travel: the points attached to them are resolved on the server from the stored
  // gate config, because a score the browser could name is a score the browser could
  // change. Disqualifying picks never get here - that path ends the visit.
  const [qualChoices, setQualChoices] = useState<Record<string, string>>({});

  // CONDITIONAL DISQUALIFYING ROUTE. Which exit this visitor was sent to, and whether
  // that exit asks for their details instead of ending the visit.
  //
  // An OPTIN exit is not a rejection: nothing is written to the lockout flag, no
  // GateDisqualified is reported, and the lead form is shown. The waitlist case - a
  // founder who clears every bar and cannot make these dates - is a lead with a timing
  // problem, and the only wrong thing to do with them is throw the email away.
  const [exitKey, setExitKey] = useState<string>("");
  // They are being asked for their details rather than turned away (either opt-in mode).
  const [exitOptin, setExitOptin] = useState(false);
  // …and this route sends them on THROUGH the assessment afterwards. The waitlist case:
  // qualified people whose only problem was the dates, who are worth a finished
  // diagnosis rather than a thank-you page.
  const [exitContinues, setExitContinues] = useState(false);
  const exits = assessment.exits ?? [];
  /** The exit being shown. An unknown key falls back to the first: a dangling route is
   *  a builder mistake, and the visitor should still see a page. */
  const currentExit = exits.find((e) => e.key === exitKey) ?? exits[0] ?? null;

  // Audience gate: the current dropdown selection (option key) + the role label the
  // respondent picked (threaded to startSubmission; stored as their audience/role).
  const [gateChoice, setGateChoice] = useState<string>("");
  // Free-text gate: the typed audience value (suggestions from the canonical list).
  const [freeAudience, setFreeAudience] = useState<string>("");
  // Custom suggestion dropdown open state (native <datalist> is unreliable on mobile
  // and dead in the IG/FB in-app browser, so we render our own list).
  const [audienceFocused, setAudienceFocused] = useState<boolean>(false);
  const [selectedRole, setSelectedRole] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  // Answers to the optional pre-results details page, keyed by field id.
  const [detailAnswers, setDetailAnswers] = useState<Record<string, string>>({});
  // Answers to the extra opt-in fields, keyed by field id.
  const [optinAnswers, setOptinAnswers] = useState<Record<string, string>>({});
  // Per-assessment CTA styling; blank falls back to the default (green/white) theme.
  const ctaStyle: React.CSSProperties = {
    ...(assessment.buttonColor ? { backgroundColor: assessment.buttonColor, borderColor: assessment.buttonColor } : {}),
    ...(assessment.buttonTextColor ? { color: assessment.buttonTextColor } : {}),
  };
  // Unguessable capability returned at Start; sent with draft-save + complete so those
  // writes can't be driven by guessing the submission id.
  const [editToken, setEditToken] = useState<string | null>(null);
  const [lead, setLead] = useState<LeadInput>({
    firstName: prefill?.firstName ?? "",
    lastName: "",
    email: prefill?.email ?? "",
    mobile: "",
    profession: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // FREE_TEXT questions: what the respondent typed, keyed by questionId. Kept apart
  // from `answers` (which holds option ids) so the routing walk, which reasons about
  // chosen options, never has to tell a cuid from a sentence.
  const [textAnswers, setTextAnswers] = useState<Record<string, string>>({});
  // CLINIC_AUDIT only: the respondent's typed exact number per scored question,
  // keyed by questionId (raw digit string; blank = use the range's midpoint).
  const [actualAnswers, setActualAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<Lockout | null>(null);
  // Billing gate: the tenant's support email, shown on the "results unavailable" screen
  // when their response cap is hit (the completion was captured but is locked).
  const [capLockedSupportEmail, setCapLockedSupportEmail] = useState<string | null>(null);
  // Qualify step: the option just picked, so its radio fills for a beat before the
  // question auto-advances (a single-select affordance on every option).
  const [qualPickedId, setQualPickedId] = useState<string | null>(null);
  const [screenIndex, setScreenIndex] = useState(0); // current question page (paginated modes)
  // Conditional routing (SINGLE mode): the stack of visited screen indices. Back
  // pops; a branch pushes. Ignored unless routing is active (see routingActive).
  const [pathStack, setPathStack] = useState<number[]>([0]);
  // Page-builder (page 2) state: the result for dynamic blocks + the deferred
  // payment (the pay button block triggers it) + a free-flow destination.
  const [pageResult, setPageResult] = useState<PageResultData | null>(null);
  const [pagePayment, setPagePayment] = useState<PaymentCheckout | null>(null);
  const [pagePaymentUrl, setPagePaymentUrl] = useState<string | null>(null);
  const [pageResultDest, setPageResultDest] = useState<string | null>(null);
  // Destination (VSL) URL the countdown screen redirects to once it elapses.
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [payPending, setPayPending] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [pending, start] = useTransition();

  // Record the opt-in page view once per load (skip admin preview).
  useEffect(() => {
    if (!preview) void recordOptinView(assessment.slug, attribution).catch(() => {});
    // Fire once per page load. attribution is read at mount (the URL is fixed for
    // the load); it's intentionally NOT a dep so a new object reference from a
    // re-render can't re-fire and double-count the view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preview, assessment.slug]);

  // Back/forward hardening: if the browser restores this page from its back-forward
  // cache (bfcache), the funnel's JS mount effects don't re-run, so a disqualified or
  // completed person could resurface a stale mid-flow page. Force a FRESH reload on a
  // bfcache restore - the fresh load re-runs the gate (disqualified → exit via the
  // gate_dq flag) and the retake lockout, so the previous page can't be reused.
  useEffect(() => {
    if (preview) return;
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) window.location.reload();
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [preview]);

  // The rejection that put this visitor on the exit page. A fresh one carries the
  // answer that caused it; a `repeat` is a revisit short-circuited by the stored flag,
  // which must NOT re-fire the pixel (re-firing on every revisit is what inflated
  // Meta's exclusion count over the real number of people rejected).
  const dqCauseRef = useRef<{ questionId?: string; optionId?: string; exitKey?: string; repeat: boolean } | null>(null);

  // Early-skip: a visitor already rejected by the gate (localStorage flag) goes
  // straight to the exit page without seeing the questions again. Checked after mount
  // (localStorage isn't available during SSR). Cheap client-side layer that works from
  // the first rejection, before the Meta exclusion audience has populated.
  useEffect(() => {
    if (!qual || preview) return;
    try {
      // A stored rejection never expires - a rejected visitor stays out of the funnel,
      // and the bfcache reload above routes a back-navigation through here too.
      const stored = readGateRejection(localStorage.getItem(gateFlagKey(assessment.slug)));
      if (stored !== null) {
        // Back to the SAME exit they were sent to. A flag written before routes existed
        // carries no key and falls back to the first exit, which is the only one those
        // funnels ever had.
        if (stored.exitKey) setExitKey(stored.exitKey);
        dqCauseRef.current = { repeat: true, exitKey: stored.exitKey ?? "" };
        setStep("disqualified");
      }
    } catch {
      /* blocked storage - ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Record the rejection (the gate creates no lead or submission, so this row is the
  // only trace). GateDisqualified itself is sent SERVER-side from that same call: a
  // rejection carries no PII, and CAPI needs none - IP, user agent, _fbp/_fbc and the
  // first-party external_id are match keys on their own. That keeps the event out of
  // ad blockers' reach and makes every firing countable, which a browser event never
  // was. The server also owns the once-per-refresh-window rule, so a revisit stays
  // silent instead of inflating Meta's count past the number of people rejected.
  const dqFiredRef = useRef(false);
  useEffect(() => {
    if (step !== "disqualified" || dqFiredRef.current) return;
    dqFiredRef.current = true;
    if (preview) return; // previewing the exit page is not a rejection
    // An OPTIN exit reaches this screen as a THANK-YOU, after the lead was captured.
    // Nobody was rejected, so nothing is reported here: the server already fired that
    // exit's own event when it wrote the lead.
    if (exitOptin) return;
    const cause = dqCauseRef.current ?? { repeat: true };

    void recordGateDisqualification(
      assessment.slug,
      {
        questionId: cause.questionId,
        optionId: cause.optionId,
        exitKey: cause.exitKey,
        repeat: cause.repeat,
        externalId: getOrCreateExternalId() ?? undefined,
      },
      attribution,
    ).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  // Record that the page-1 gate was PASSED - the only trace left by someone who
  // qualifies and then leaves before the opt-in (which is the last step, so no
  // Submission exists yet). Nothing is sent to Meta here: AssessmentAbandoned is
  // fired later by the sweep, once it can tell an abandoner from a completer.
  //
  // Called from BOTH gate exits (the last radio question and the text-question
  // Continue), guarded by a ref for this mount and by localStorage across mounts,
  // so a refresh or a return visit doesn't re-record. Fire-and-forget - the
  // respondent never waits on it, and a failure never blocks entry.
  const gatePassFiredRef = useRef(false);
  function markGatePassed() {
    if (preview || gatePassFiredRef.current) return;
    gatePassFiredRef.current = true;
    try {
      if (localStorage.getItem(`gate_pass:${assessment.slug}`) === "1") return;
      localStorage.setItem(`gate_pass:${assessment.slug}`, "1");
    } catch {
      /* private mode / blocked storage - fall through and record anyway */
    }
    const vid = getOrCreateExternalId();
    if (!vid) return; // no first-party id → nothing Meta could match on later
    void recordGatePass(assessment.slug, vid, attribution).catch(() => {});
  }

  // Reaching the opt-in form is recorded while the page is alive and well, not
  // inferred from the departure beacon below. A beacon can be lost - JS blocked, the
  // browser killed - and a lost beacon would file someone who saw the ask and refused
  // it as someone who never saw it, which is the one distinction these two events
  // exist to make.
  const optinSeenRef = useRef(false);
  useEffect(() => {
    // SPLIT never renders this form. It stamps emailCapturedAt server-side instead,
    // when an email is actually submitted, and the sweep reads either stamp - see
    // lib/events/abandoned.ts.
    if (splitActive) return;
    if (preview || step !== "leadForm" || optinSeenRef.current) return;
    optinSeenRef.current = true;
    const vid = getOrCreateExternalId();
    if (!vid) return;
    void recordOptinSeen(assessment.slug, vid).catch(() => {});
  }, [preview, step, assessment.slug, splitActive]);

  // Leaving the opt-in page without opting in → fire AssessmentAbandoned NOW.
  //
  // This is the moment the funnel loses someone it already qualified, and until now
  // the only trace was a GateEntry row waiting for a nightly sweep. Firing here means
  // the retargeting audience fills while the ad is still running, not a day later.
  //
  // `pagehide` covers the back button, a tab close and a real navigation away.
  // `visibilitychange` covers switching apps, which on a phone is how most people
  // leave - and, since this form asks for a WhatsApp number, is also how some people
  // go and fetch it. That false positive is deliberate and harmless: the event only
  // ever fires once per visitor (a compare-and-swap on the gate row), and the ad set
  // excludes CompleteRegistration, so the moment they come back and opt in they drop
  // out of the retargeting audience on their own. Missing a real abandoner costs more
  // than briefly including someone who returns.
  //
  // sendBeacon, not fetch: the page is being torn down and an ordinary request is
  // routinely cancelled. Guarded by a ref so several events in one teardown (hidden
  // then pagehide) send one beacon.
  const abandonBeaconRef = useRef(false);
  useEffect(() => {
    // Only on a screen that is ASKING for contact details, only before a submission
    // exists (creating one IS the opt-in), and never in the builder preview.
    //
    // In SPLIT that is the email and phone screens. Not the name screen: nothing has
    // been asked of them yet that they could be said to have refused, and on a gated
    // funnel there is not even a row to hang the verdict on.
    const asking = splitActive ? step === "leadEmail" || step === "leadPhone" : step === "leadForm";
    if (preview || !asking || submissionId) return;

    const send = () => {
      if (abandonBeaconRef.current) return;
      const vid = getOrCreateExternalId();
      if (!vid) return; // no first-party id → nothing Meta could match on
      abandonBeaconRef.current = true;
      try {
        const body = JSON.stringify({ slug: assessment.slug, visitorId: vid });
        navigator.sendBeacon?.("/api/track/abandon", body);
      } catch {
        /* a closing page is not a place to handle errors */
      }
    };
    const onHide = () => {
      if (document.visibilityState === "hidden") send();
    };

    window.addEventListener("pagehide", send);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("pagehide", send);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [preview, step, submissionId, assessment.slug, splitActive]);
  // Autosave progress (debounced) so a returning unpaid respondent resumes where
  // they left off. Only while answering, only once they've picked something.
  useEffect(() => {
    if (preview || step !== "questions" || !submissionId) return;
    if (Object.keys(answers).length === 0 && Object.keys(textAnswers).length === 0) return;
    const t = setTimeout(() => {
      void saveDraftAnswers(
        submissionId,
        [
          ...Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
          ...Object.entries(textAnswers)
            .filter(([, v]) => v.trim().length > 0)
            .map(([questionId, textValue]) => ({ questionId, textValue })),
        ],
        editToken ?? undefined,
      ).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [answers, textAnswers, submissionId, step, preview, editToken]);

  /**
   * Does this funnel ask the respondent for anything about themselves? Lead fields,
   * profession (unless the audience gate replaced it) or extra opt-in fields. False
   * means the opt-in screen has nothing on it and is skipped entirely.
   */
  const collectsAnything =
    assessment.collectFirstName ||
    assessment.collectLastName ||
    assessment.collectEmail ||
    assessment.collectMobile ||
    (assessment.collectProfession && !gated) ||
    assessment.optinFields.length > 0;

  const questions = assessment.categories.flatMap((c) => c.questions);
  /** Answered means an option for a choice question, or non-blank text for a typed
   *  one. Every required-answer check goes through this, so a required FREE_TEXT
   *  question is satisfied by what they wrote rather than by an option it has none of. */
  const isAnswered = (q: PublicQuestion): boolean =>
    q.type === "FREE_TEXT" ? (textAnswers[q.id] ?? "").trim().length > 0 : !!answers[q.id];
  const requiredUnanswered = questions.filter((q) => q.required && !isAnswered(q)).length;
  /** First invalid typed actual number, if any - a wrong unit here silently skews
   *  every figure on the result, so it must be corrected before submitting. */
  const firstActualError = questions.reduce<string | null>((found, q) => {
    if (found || !q.scoringRole || !CLINIC_ACTUAL_FIELD[q.scoringRole]) return found;
    return actualNumberError(
      q.scoringRole,
      unitForQuestion(q),
      actualAnswers[q.id] ?? "",
    );
  }, null);

  // Conditional routing. The spine mirrors the SINGLE-mode screen order (page 1
  // then 2, each in displayOrder), so a spine index equals a screen index. Routing
  // is honored ONLY in SINGLE mode and only when at least one option carries a
  // route - otherwise everything below is inert and the flow is unchanged.
  const spine = buildSpine(
    assessment.categories.map((c) => ({
      id: c.id,
      page: c.page,
      questions: c.questions.map((q) => ({ id: q.id, defaultRoute: q.defaultRoute ?? null })),
    })),
  );
  const byOption = new Map<string, RouteSpec>();
  for (const c of assessment.categories)
    for (const q of c.questions)
      for (const o of q.options) if (o.route) byOption.set(o.id, o.route);
  // Active when at least one option rule OR one default route exists. Default routes
  // count: a survey can branch on answers and rejoin on defaults alone.
  const routingActive =
    assessment.questionDisplayMode === "SINGLE" && hasRouting(spine, byOption);
  // Reached set from the current answers (routing only): questions actually
  // traversed. Required-answer enforcement counts only reached questions, so a
  // question skipped by a jump never blocks submit.
  const reachedSet = routingActive
    ? walk(new Map(Object.entries(answers)), spine, byOption).reachedSet
    : null;
  const requiredUnansweredEffective = routingActive
    ? questions.filter((q) => reachedSet!.has(q.id) && q.required && !isAnswered(q)).length
    : requiredUnanswered;

  // Honeypot input ref - hidden from humans; a filled value marks a bot opt-in.
  const hpRef = useRef<HTMLInputElement>(null);
  // Pending auto-advance timer (paginated modes): picking an option moves to the
  // next screen after a short beat. Held in a ref so a re-selection or a manual
  // Next/Back cancels the in-flight advance instead of double-firing.
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Hand the respondent to signup with what we already know about them.
   *
   * window.location, not router.push: this leaves the funnel for the app shell, and a
   * hard navigation guarantees a clean server render of /sign-up with the prefill.
   * /sign-up sends an email that already has an account on to sign-in, so this one
   * call serves both a new prospect and a returning one.
   */
  function goToSignup() {
    const params = new URLSearchParams();
    if (lead.email) params.set("email", lead.email);
    const name = [lead.firstName, lead.lastName].filter(Boolean).join(" ").trim();
    if (name) params.set("name", name);
    // The ad params come with them. This is the last hop of the chain that starts at the
    // marketing CTA, and it used to be where the chain ended: the signup URL carried a
    // prefilled email and nothing about where the person came from. The cookie records
    // the acquisition either way, but anything reading the signup URL - a pixel event,
    // a session replay, a support ticket asking which campaign this account came from -
    // saw direct traffic.
    for (const [key, value] of Object.entries(currentAdParams()))
      if (!params.has(key)) params.set(key, value);
    const qs = params.toString();
    window.location.href = qs ? `/sign-up?${qs}` : "/sign-up";
  }

  /**
   * Start the submission from the opt-in form - or, when there IS no form, from
   * nothing. `e` is optional for exactly that: a funnel that asks for no contact
   * details calls this directly instead of rendering an empty screen with a button.
   */
  function submitLead(e?: React.FormEvent<HTMLFormElement>) {
    e?.preventDefault();
    setError(null);
    // Required extra opt-in fields must be filled before we start.
    const missingOptin = assessment.optinFields.find((f) => f.required && !(optinAnswers[f.id] ?? "").trim());
    if (missingOptin) {
      setError(`Please fill in "${missingOptin.label}".`);
      return;
    }
    // Honeypot: hidden field only a bot fills. Its value is passed to the server,
    // which silently refuses when it is non-empty.
    const honeypot = hpRef.current?.value ?? "";
    const optin = Object.keys(optinAnswers).length ? optinAnswers : undefined;
    start(async () => {
      const res = await startSubmission(assessment.slug, lead, attribution, preview, honeypot, optin, selectedRole ?? undefined, getOrCreateExternalId() ?? undefined, Object.keys(qualTextAnswers).length ? qualTextAnswers : undefined, Object.keys(qualChoices).length ? qualChoices : undefined, exitOptin ? exitKey || undefined : undefined);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data?.status === "locked") {
        // A signup funnel has no result to withhold and no second run to sell. Whoever
        // is here already completed it, which means they already have (or started) an
        // account - so the right answer is the account, not a dead end telling them to
        // come back in fifteen days. /sign-up routes a known email on to sign-in, so
        // this lands them wherever they actually belong.
        //
        // This is the retake lock doing its job and the ENDING deciding what that
        // means, rather than one screen being right for every funnel.
        if (terminalStage(flowInput) === "SIGNUP") {
          goToSignup();
          return;
        }
        setLockout({
          policy: res.data.policy,
          lastCompletedAt: res.data.lastCompletedAt,
          nextAvailableAt: res.data.nextAvailableAt,
          resultAvailable: res.data.resultAvailable,
        });
        setStep("locked");
        return;
      }
      // An OPTIN exit ends here: details captured, the exit's content is the thank-you.
      // A CONTINUE exit does NOT - it falls through to the ordinary flow below and
      // answers the whole assessment, which is the entire point of that mode.
      //
      // Neither reports CompleteRegistration. The server files both under the exit's own
      // event name, because a waitlist sign-up counted as a registration teaches the ad
      // account to find more people who cannot come.
      if (exitOptin && !exitContinues) {
        setSubmissionId(res.data?.submissionId ?? null);
        setStep("disqualified");
        return;
      }
      // Meta Pixel: fire CompleteRegistration ONLY on a genuine new
      // registration (server returns an eventId then; absent on resume). The
      // eventId dedups against the server-side CAPI event of the same name.
      if (res.data?.status === "started" && res.data.eventId) {
        pixelTrack("CompleteRegistration", { content_name: assessment.title }, res.data.eventId);
      }
      const newSid = res.data?.submissionId ?? null;
      const newTok = res.data?.status === "started" ? res.data.editToken : null;
      setSubmissionId(newSid);
      setEditToken(newTok);
      // Resume: pre-fill answers they saved/submitted before (editable until paid).
      // One flat map arrives; the question's own type says whether a value is an
      // option id or the text they typed.
      if (res.data?.status === "started" && res.data.answers) {
        const resumed = res.data.answers;
        const picks: Record<string, string> = {};
        const typed: Record<string, string> = {};
        for (const q of assessment.categories.flatMap((c) => c.questions)) {
          const v = resumed[q.id];
          if (v === undefined) continue;
          if (q.type === "FREE_TEXT") typed[q.id] = v;
          else picks[q.id] = v;
        }
        setAnswers(picks);
        setTextAnswers(typed);
      }
      // Lead-capture-after: questions are already answered - go straight to the
      // pre-results details (if any) or complete now, using the FRESH ids.
      if (assessment.leadCaptureAfter) {
        if (assessment.preResultFields.length > 0) {
          setStep("details");
        } else {
          runCompletion(undefined, newSid ?? undefined, newTok ?? undefined);
        }
        return;
      }
      // Nothing to ask: skip the questions step rather than showing an empty one.
      if (!hasScoredQuestions) {
        if (assessment.preResultFields.length > 0) setStep("details");
        else runCompletion(undefined, newSid ?? undefined, newTok ?? undefined);
        return;
      }
      setScreenIndex(0); // start at the first question page
      setPathStack([0]);
      setStep("questions");
    });
  }

  // Audience gate: redirect to another assessment (carrying attribution so ad
  // tracking survives the hop).
  function redirectToAssessment(slug: string) {
    const params = new URLSearchParams(attribution ?? {});
    if (preview) params.set("preview", "1"); // keep cascade testing in preview mode
    const qs = params.toString();
    window.location.href = `/a/${slug}${qs ? `?${qs}` : ""}`;
  }

  // Qualification (Page 1): pick an answer. A disqualifying option routes to the
  // disqualified page - NO lead / submission / result is ever created (optionally
  // fires a custom "Disqualified" pixel event for ad exclusion). A qualifying answer
  // auto-advances to the next question, then enters the assessment after the last.
  /**
   * Send this visitor out through a named exit.
   *
   * PAGE exits behave as the single disqualified page always has: the lockout flag is
   * written, the rejection is reported, and the exit's content is the last thing they
   * see. OPTIN exits do none of that - they are not being turned away.
   */
  function goToExit(key: string, cause: { questionId?: string; optionId?: string }) {
    const exit = exits.find((e) => e.key === key) ?? exits[0] ?? null;
    const resolved = exit?.key ?? "";
    setExitKey(resolved);

    if (exit?.mode === "OPTIN" || exit?.mode === "CONTINUE") {
      setExitOptin(true);
      dqCauseRef.current = null;

      // 🔴 REPORTED HERE, AT THE GATE, not when they opt in.
      //
      // With capture at the end of the assessment the opt-in can be ten minutes and
      // twenty-one questions away, and anybody who leaves in between would have left no
      // trace at all. Taking the route IS the fact worth recording, and it needs no
      // lead data: the server sends it with ip / user agent / fbp / external_id, the
      // same match keys a rejection uses. Nothing else fires for these people afterwards.
      if (!preview) {
        void recordGateDisqualification(
          assessment.slug,
          {
            questionId: cause.questionId,
            optionId: cause.optionId,
            exitKey: resolved,
            repeat: false,
            externalId: getOrCreateExternalId() ?? undefined,
          },
          attribution,
        ).catch(() => {});
      }

      if (exit.mode === "CONTINUE") {
        // 🔴 The funnel's OWN ordering, not a hardcoded lead form.
        //
        // Sending them straight to "leadForm" broke every lead-capture-AFTER funnel:
        // the opt-in handler there assumes the questions are already answered, so it
        // completed the submission on the spot with nothing in it. A routed-in
        // respondent takes the same path as somebody who passed, which is the whole
        // point of this mode - only what they are told at the end differs.
        setExitContinues(true);
        if (splitActive) {
          splitAdvance("qualify");
          return;
        }
        setStep(gated ? "gate" : afterIntroStep());
        return;
      }

      // A thank-you route: the lead form IS the rest of the visit.
      setExitContinues(false);
      setStep("leadForm");
      return;
    }

    if (!preview) {
      try {
        // Locks this browser out for good, remembering WHICH exit, so a return visit
        // lands on the same page rather than on whatever happens to be first.
        localStorage.setItem(gateFlagKey(assessment.slug), writeGateRejection(Date.now(), resolved));
      } catch {
        /* private mode / blocked storage - non-fatal */
      }
    }
    dqCauseRef.current = { ...cause, exitKey: resolved, repeat: false };
    setStep("disqualified");
  }

  /**
   * The end of the gate for somebody who dodged every hard exit.
   *
   * With bands switched on this asks the server for a verdict, because the thresholds
   * and the points are deliberately not in this page. Without them it is the straight
   * pass the gate has always been, with no round trip.
   */
  function finishGate(choices: Record<string, string>) {
    const enter = () => {
      markGatePassed(); // cleared the whole gate - they are now in the funnel
      // SPLIT runs the audience gate BEFORE the gate, so clearing the gate never
      // sends anyone back to it: the email screen is what comes next.
      if (splitActive) {
        splitAdvance("qualify");
        return;
      }
      setStep(gated ? "gate" : afterIntroStep());
    };
    if (!qual?.bandsEnabled || preview) {
      enter();
      return;
    }
    start(async () => {
      const verdict = await evaluateGate(assessment.slug, choices).catch(() => ({ outcome: "pass" as const }));
      if (verdict.outcome === "exit") {
        goToExit(verdict.exitKey ?? "", {});
        return;
      }
      // "review" is a flag on the lead, not a different journey: the respondent walks
      // the same funnel and never learns they were borderline. The band itself is
      // recomputed and stored server-side when the submission starts.
      enter();
    });
  }

  function pickQualOption(option: { id: string; disqualifies: boolean; exitKey?: string }) {
    setError(null);
    // Fill the picked radio, then advance a beat later so the selection registers.
    setQualPickedId(option.id);
    window.setTimeout(() => {
      setQualPickedId(null);
      if (option.disqualifies) {
        // A hard exit is decided HERE, from the key already in the payload, rather than
        // by asking the server: making somebody wait on a network call to be told they
        // are not a fit is its own small insult. The server re-checks it anyway before
        // anything is reported to Meta.
        goToExit(option.exitKey ?? "", {
          questionId: qual?.questions[qualIndex]?.id,
          optionId: option.id,
        });
        return;
      }
      if (!qual) return;
      const answeredId = qual.questions[qualIndex]?.id;
      const nextChoices = answeredId ? { ...qualChoices, [answeredId]: option.id } : qualChoices;
      if (answeredId) setQualChoices(nextChoices);
      if (qualIndex < qual.questions.length - 1) setQualIndex((i) => i + 1);
      // The state set above has not landed yet, so the verdict is asked for with the
      // map built by hand - the last answer is the one most likely to decide a band.
      else finishGate(nextChoices);
    }, 160);
  }

  // Qualification TEXT question "Continue": validate required, then advance (these
  // never qualify/disqualify - the answer is stored for the owner's manual review).
  function submitQualText(questionId: string, required: boolean) {
    const v = (qualTextAnswers[questionId] ?? "").trim();
    if (required && !v) {
      setError("Please fill this in to continue.");
      return;
    }
    setError(null);
    if (!qual) return;
    if (qualIndex < qual.questions.length - 1) setQualIndex((i) => i + 1);
    // Same exit as the radio path (finishGate), not a hardcoded "intro": a gate whose
    // LAST question happened to be a text one dropped the respondent on the
    // title-and-Start screen the radio path skips, and on a gate-only funnel that is
    // a Start button in front of nothing.
    else finishGate(qualChoices);
  }

  // Audience gate "Continue": a redirecting choice hops to its assessment; a
  // "continue here" choice stores the picked role and enters the normal opt-in flow.
  function submitGate() {
    if (!gate) return;
    // Free-text mode: accept whatever they typed (or picked from suggestions). No
    // routing - always continue in this assessment.
    if (gate.mode === "FREETEXT") {
      const typed = freeAudience.trim();
      if (gate.required && !typed) {
        setError("Please fill this in to continue.");
        return;
      }
      setError(null);
      setSelectedRole(typed || null);
      if (splitActive) {
        splitAdvance("gate");
        return;
      }
      setStep(afterIntroStep());
      return;
    }
    const opt = gate.options.find((o) => o.key === gateChoice);
    if (!opt) {
      setError("Please choose an option to continue.");
      return;
    }
    setError(null);
    if (opt.redirectSlug) {
      redirectToAssessment(opt.redirectSlug);
      return;
    }
    setSelectedRole(opt.label); // continue in this assessment
    if (splitActive) {
      splitAdvance("gate");
      return;
    }
    setStep(afterIntroStep());
  }

  /**
   * Where to go once the gates are done.
   *
   * Lead-capture-AFTER: the intro is nothing but a title and a Start button, so after a
   * qualification gate it is pure friction and gets skipped. Lead-FIRST: the intro screen
   * IS the opt-in form, so it must still render; only its landing copy is suppressed.
   */
  function afterIntroStep(): Step {
    return afterGateStep(entry);
  }

  function emailPreviousResults() {
    setError(null);
    start(async () => {
      const res = await requestPreviousResults(assessment.slug, lead);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setEmailSent(true);
    });
  }

  /**
   * The next screen in a SPLIT run.
   *
   * One ordered sequence, resolved in flow/lead-split.ts and pinned by
   * verify:lead-split, rather than a ladder of ifs here. Null means the sequence is
   * finished and the run completes instead of moving on.
   */
  function splitAdvance(from: SplitStep): void {
    const next = splitNextStep(splitInput, from);
    if (next === "questions") {
      setScreenIndex(0);
      setPathStack([0]);
    }
    if (next) {
      setStep(next as Step);
      return;
    }
    // Nothing further to ask: the phone screen is the only place that can finish a
    // split run, so reaching here without one means the configuration has no phone
    // and the email screen was the last lead field.
    submitSplitPhone();
  }

  /** Name screen: nothing is sent anywhere. What is typed here is held in the browser
   *  until the email screen posts it, AFTER the gate verdict - which is what lets a
   *  name be asked for before the gate without a rejected visitor leaving a lead. */
  function submitSplitName() {
    setError(null);
    const f = nameScreenFields(splitInput);
    if (f.firstName && !(lead.firstName ?? "").trim()) {
      setError("Please enter your first name.");
      return;
    }
    if (f.lastName && !(lead.lastName ?? "").trim()) {
      setError("Please enter your last name.");
      return;
    }
    if (f.profession && !(lead.profession ?? "").trim()) {
      setError("Please choose an option to continue.");
      return;
    }
    splitAdvance("leadName");
  }

  /** Email screen: the moment somebody becomes a lead. */
  function submitSplitEmail() {
    setError(null);
    const email = (lead.email ?? "").trim();
    if (!isValidEmail(email)) {
      setError(EMAIL_ERROR);
      return;
    }
    const missingOptin = assessment.optinFields.find(
      (f) => f.required && !(optinAnswers[f.id] ?? "").trim(),
    );
    if (missingOptin) {
      setError(`Please fill in "${missingOptin.label}".`);
      return;
    }
    if (preview) {
      // The builder preview writes nothing, exactly as it writes no submission.
      splitAdvance("leadEmail");
      return;
    }
    const vid = getOrCreateExternalId();
    if (!vid) {
      setError("Please enable cookies for this site and try again.");
      return;
    }
    start(async () => {
      const res = await captureSplitLead(assessment.slug, {
        visitorId: vid,
        firstName: lead.firstName ?? "",
        lastName: lead.lastName ?? "",
        profession: lead.profession ?? "",
        email,
        audienceRole: selectedRole ?? undefined,
        optinAnswers: Object.keys(optinAnswers).length ? optinAnswers : undefined,
        qualAnswers: Object.keys(qualTextAnswers).length ? qualTextAnswers : undefined,
        qualChoices: Object.keys(qualChoices).length ? qualChoices : undefined,
        honeypot: hpRef.current?.value ?? "",
        attribution,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // The retake lock runs HERE in split mode, which is far earlier than a
      // single-screen funnel can run it: a locked-out retaker is turned away now
      // rather than after answering the whole assessment.
      if (res.data?.status === "locked") {
        if (terminalStage(flowInput) === "SIGNUP") {
          goToSignup();
          return;
        }
        setLockout({
          policy: res.data.policy,
          lastCompletedAt: res.data.lastCompletedAt,
          nextAvailableAt: res.data.nextAvailableAt,
          resultAvailable: res.data.resultAvailable,
        });
        setStep("locked");
        return;
      }
      if (res.data?.status === "captured") {
        setSplitHandle({ customerId: res.data.customerId, leadToken: res.data.leadToken });
      }
      splitAdvance("leadEmail");
    });
  }

  /**
   * Phone screen: the last lead field, and therefore where the submission is created
   * and CompleteRegistration fires.
   *
   * 🔴 Never earlier. Firing on the first screen would report a lead that is a name
   * with no way to reach it, and teach the ad account to find more of those.
   */
  function submitSplitPhone() {
    setError(null);
    const mobile = (lead.mobile ?? "").trim();
    let normalized = mobile;
    if (assessment.collectMobile) {
      const phone = normalizePhone(mobile);
      if (!phone.ok) {
        setError(phone.error);
        return;
      }
      // The CLEANED number is what gets stored, so the retake key, the CRM and the
      // WhatsApp sender all see the same ten digits however it happened to be typed.
      normalized = phone.value;
      if (normalized !== mobile) setLead((l) => ({ ...l, mobile: normalized }));
    }
    if (preview) {
      runCompletion(
        assessment.preResultFields.length > 0 ? detailAnswers : undefined,
      );
      return;
    }
    if (!splitHandle) {
      setError("Session expired. Please start again.");
      return;
    }
    const vid = getOrCreateExternalId();
    start(async () => {
      const res = await startSubmission(
        assessment.slug,
        // Only the phone number travels from this screen: the identity is read back
        // from the lead row written at the email screen.
        { mobile: normalized },
        attribution,
        preview,
        hpRef.current?.value ?? "",
        undefined,
        undefined,
        vid ?? undefined,
        undefined,
        undefined,
        undefined,
        { ...splitHandle, visitorId: vid ?? "" },
      );
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data?.status === "locked") {
        setLockout({
          policy: res.data.policy,
          lastCompletedAt: res.data.lastCompletedAt,
          nextAvailableAt: res.data.nextAvailableAt,
          resultAvailable: res.data.resultAvailable,
        });
        setStep("locked");
        return;
      }
      if (res.data?.status === "started" && res.data.eventId) {
        pixelTrack("CompleteRegistration", { content_name: assessment.title }, res.data.eventId);
      }
      const newSid = res.data?.submissionId ?? null;
      const newTok = res.data?.status === "started" ? res.data.editToken : null;
      setSubmissionId(newSid);
      setEditToken(newTok);
      runCompletion(
        assessment.preResultFields.length > 0 ? detailAnswers : undefined,
        newSid ?? undefined,
        newTok ?? undefined,
      );
    });
  }

  function submitAnswers() {
    setError(null);
    if (requiredUnansweredEffective > 0) {
      setError(`Please answer all required questions (${requiredUnansweredEffective} left).`);
      return;
    }
    if (firstActualError) {
      setError(firstActualError);
      return;
    }
    // SPLIT: the lead is already half captured, and what follows the questions is the
    // pre-result page or the phone screen - never the single opt-in form.
    if (splitActive) {
      splitAdvance("questions");
      return;
    }
    // Lead-capture-after: the questions ran anonymously; now collect the lead (which
    // creates the submission), then complete.
    //
    // UNLESS there is nothing to collect. A funnel that asks for no contact details -
    // an exit survey sent to somebody whose email we have had for months - would
    // otherwise show a form with no fields and a button, which is a screen asking a
    // leaving customer to confirm that we have nothing to ask them. It starts the
    // submission itself instead, carrying whatever the signed hand-off already told
    // us about them.
    if (assessment.leadCaptureAfter && !submissionId) {
      setError(null);
      if (!collectsAnything) {
        submitLead();
        return;
      }
      setStep("leadForm");
      return;
    }
    if (!submissionId) {
      setError("Session expired. Please restart.");
      return;
    }
    // Optional pre-results data-capture page: collect the extra details first, then
    // complete. No fields configured = complete straight away (unchanged flow).
    if (assessment.preResultFields.length > 0) {
      setStep("details");
      return;
    }
    runCompletion();
  }

  function submitDetails() {
    setError(null);
    const missing = assessment.preResultFields.find((f) => f.required && !(detailAnswers[f.id] ?? "").trim());
    if (missing) {
      setError(`Please fill in "${missing.label}".`);
      return;
    }
    // SPLIT: the phone screen still has to run before anything completes.
    if (splitActive) {
      splitAdvance("details");
      return;
    }
    runCompletion(detailAnswers);
  }

  function runCompletion(preResultAnswers?: Record<string, string>, sidArg?: string, tokArg?: string) {
    // In lead-capture-after mode the submission is created moments earlier, so the
    // caller passes the fresh id/token (React state isn't updated synchronously).
    const sid = sidArg ?? submissionId;
    const tok = tokArg ?? editToken ?? undefined;
    if (!sid) {
      setError("Session expired. Please restart.");
      setStep("questions");
      return;
    }
    const payload = {
      answers: [
        ...Object.entries(answers).map(([questionId, optionId]) => ({
          questionId,
          optionId,
        })),
        // Typed answers. Blank ones are left out entirely: an empty box is a skip.
        ...Object.entries(textAnswers)
          .map(([questionId, textValue]) => ({ questionId, textValue: textValue.trim() }))
          .filter((a) => a.textValue.length > 0),
      ],
    };
    const details = preResultAnswers && Object.keys(preResultAnswers).length ? preResultAnswers : undefined;
    const actual = Object.keys(actualAnswers).length ? actualAnswers : undefined;
    // Switch to the countdown IMMEDIATELY (outside the transition) so it renders
    // from 3, while the server scores + generates the AI statement.
    setStep("evaluating");
    start(async () => {
      const res = await completeSubmission(sid, payload, tok, details, actual);
      if (!res.ok) {
        setError(res.error);
        setStep("questions");
        return;
      }
      // Billing gate: the workspace is over its response cap. The answers were captured,
      // but the result is locked - show a neutral "results unavailable" screen with the
      // support email. No pixel, no payment, no redirect (the server suppressed the
      // whole fan-out too).
      if (res.data?.capLocked) {
        setCapLockedSupportEmail(res.data.supportEmail ?? null);
        setStep("capLocked");
        return;
      }
      // Meta Pixel: assessment finished (custom event) - fire before the
      // redirect, ONLY for the winning completion (server returns an eventId
      // then). The eventId dedups against the server-side CAPI event.
      if (res.data?.eventId) {
        // The NAME comes from the server, which decided it: a respondent routed in
        // through a waitlist exit reports nothing at all, and one whose route names its
        // own event must not have the funnel's name fired underneath it.
        pixelTrackCustom(
          res.data.eventName ?? completionEventName(!!qual),
          { content_name: assessment.title },
          res.data.eventId,
        );
      }
      // Platform signup funnel. Deliberately placed AFTER the completion event fires:
      // the whole point of this funnel is that the qualified completion is measured
      // like any other, and only then does the person get handed to signup. Redirecting
      // first would cost the ad account the very signal this product exists to send.
      //
      // window.location, not router.push: this leaves the funnel for the app shell, and
      // a hard navigation guarantees a clean server render of /sign-up with the prefill.
      if (assessment.platformSignup) {
        goToSignup();
        return;
      }
      // Page builder: if pages are configured, show them (results teaser + the pay
      // button block) instead of going straight to payment/VSL. Defer the payment
      // (the pay button triggers it) + fetch the result for the dynamic blocks.
      if (assessment.pages.length > 0) {
        // Paid mode must have a payment method; never show page 2 with a free
        // fallback (that would unlock the paid result for free).
        if (assessment.paidMode && !res.data?.payment && !res.data?.paymentRedirectUrl) {
          setError("We couldn't start the payment just now. Please tap Submit again.");
          setStep("questions");
          return;
        }
        setPagePayment(res.data?.payment ?? null);
        setPagePaymentUrl(res.data?.paymentRedirectUrl ?? null);
        // Free fallback destination only - in paid mode the button pays, never
        // redirects to the (free) result.
        setPageResultDest(assessment.paidMode ? null : (res.data?.resultUrl ?? null));
        const r = await getResultForPages(sid);
        if (r.ok && r.data) setPageResult(r.data);
        setStep("resultPages");
        return;
      }
      // NO_RESULT: the answers are stored and the webhook has fired. Nothing is shown
      // back, so there is no url to hand the countdown and nothing to redirect to -
      // the thank-you line IS the last screen.
      if (assessment.nextStep === "NO_RESULT") {
        setStep("thanks");
        return;
      }
      // Paid mode: take payment instead of going to the VSL/result (results are
      // already stored; after paying, the user lands on the VSL with the token).
      // Razorpay Checkout opens with the lead's details prefilled - no form to fill;
      // on success Razorpay redirects to /api/payments/verify which sends them on.
      if (res.data?.payment) {
        try {
          await openRazorpayCheckout(res.data.payment, () => {
            setError("Payment was cancelled. Tap Submit to try again.");
            setStep("questions");
          });
        } catch {
          setError("We couldn't load the payment screen. Please tap Submit again.");
          setStep("questions");
        }
        return; // Checkout navigates away on success (redirect: true).
      }
      // Fallback: a static payment link (Razorpay not configured) with the token.
      if (res.data?.paymentRedirectUrl) {
        await new Promise((r) => setTimeout(r, 1200));
        window.location.replace(res.data.paymentRedirectUrl);
        return;
      }
      // Paid mode but no payment method available: do NOT fall through to the free
      // VSL. Show an error so the user can retry.
      if (assessment.paidMode) {
        setError("We couldn't start the payment just now. Please tap Submit again.");
        setStep("questions");
        return;
      }
      // Hand the destination URL to the countdown screen: it shows a fixed
      // VSL_COUNTDOWN_SECONDS anticipation timer (started at Submit, overlapping
      // scoring) and redirects once it elapses AND this URL is ready - guaranteeing
      // a minimum wait without ever cutting scoring short. Append event=1 so the
      // destination's VSL-view pixel fires ONCE on this post-completion redirect;
      // the link saved to the CRM stays without it, so later opens don't re-fire.
      const base = res.data?.resultUrl ?? `/a/${assessment.slug}/r/${sid}`;
      const url = base + (base.includes("?") ? "&" : "?") + "event=1";
      setRedirectUrl(url);
    });
  }

  // Pay button on a result page: open the deferred payment (or fall back to the
  // free VSL when no payment is configured).
  function payFromPage() {
    setPayError(null);
    if (pagePayment) {
      setPayPending(true);
      openRazorpayCheckout(pagePayment, () => {
        setPayError("Payment was cancelled. Tap the button to try again.");
        setPayPending(false);
      }).catch(() => {
        setPayError("We couldn't load the payment screen. Please try again.");
        setPayPending(false);
      });
      return;
    }
    if (pagePaymentUrl) {
      window.location.replace(pagePaymentUrl);
      return;
    }
    // Paid mode with no payment method available: do NOT fall through to the free
    // result - surface an error so they can retry.
    if (assessment.paidMode) {
      setPayError("We couldn't start the payment just now. Please try again.");
      return;
    }
    if (pageResultDest) {
      // If the destination is an EXTERNAL VSL page (its own VidaPulse embed), carry the
      // opaque customerId there too, so that page can bind it. No-op when tracking is off.
      const dest = appendVidapulseId(pageResultDest, pageResult?.vidapulseParam ?? null, pageResult?.customerId ?? null);
      const u = dest + (dest.includes("?") ? "&" : "?") + "event=1";
      window.location.replace(u);
    }
  }

  if (step === "thanks") {
    return (
      <div className="flex flex-col gap-4 text-center" data-qa-step="thanks">
        <h2 className="text-2xl font-bold tracking-tight">
          {assessment.thankYouMessage?.trim() || "Thank you. Your answers are recorded."}
        </h2>
      </div>
    );
  }

  if (step === "resultPages") {
    return (
      <ResultPages
        pages={assessment.pages}
        result={pageResult ?? { overallBandTitle: null, overallBandLevel: null, categories: [], customerId: null, vidapulseParam: null }}
        onPay={payFromPage}
        payPending={payPending}
        payError={payError}
      />
    );
  }

  /**
   * The one sentence above the opt-in form.
   *
   * After a gate this is the first thing a qualified respondent reads. Passing the gate
   * is the moment of most investment in the whole funnel - several questions answered,
   * and told they are through - and until now it was answered with a bare form. This is
   * where the offer goes.
   *
   * Styled as a notice rather than a heading so it reads as something gained, and sits
   * with the form rather than competing with it.
   */
  const qualifiedNote = assessment.qualifiedNote?.trim() ? (
    <p className="rounded-md border border-green-600/40 bg-green-600/10 px-4 py-3 text-sm font-medium whitespace-pre-line text-[var(--foreground)]">
      {assessment.qualifiedNote.trim()}
    </p>
  ) : null;

  // Reusable pieces of the opt-in form - shown on the intro screen (lead-first) OR on
  // the dedicated leadForm step (lead-after). Defined here so both steps share them.
  const honeypotInput = (
    <input
      ref={hpRef}
      type="text"
      name="contact_pref_hp"
      tabIndex={-1}
      autoComplete="off"
      aria-hidden="true"
      data-lpignore="true"
      data-1p-ignore="true"
      data-bwignore="true"
      data-form-type="other"
      className="absolute left-[-9999px] h-0 w-0 opacity-0"
    />
  );
  const leadFieldsBlock = (
    <div className="flex flex-col gap-4">
      {assessment.collectFirstName ? (
        <Field qa="firstName" label={assessment.firstNameLabel?.trim() || "First name"} required={assessment.firstNameRequired} value={lead.firstName ?? ""} onChange={(v) => setLead((l) => ({ ...l, firstName: v }))} />
      ) : null}
      {assessment.collectLastName ? (
        <Field qa="lastName" label={assessment.lastNameLabel?.trim() || "Last name"} required={assessment.lastNameRequired} value={lead.lastName ?? ""} onChange={(v) => setLead((l) => ({ ...l, lastName: v }))} />
      ) : null}
      {assessment.collectEmail ? (
        <Field qa="email" label={assessment.emailLabel?.trim() || "Email"} type="email" required={assessment.emailRequired} value={lead.email ?? ""} onChange={(v) => setLead((l) => ({ ...l, email: v }))} />
      ) : null}
      {assessment.collectMobile ? (
        <Field qa="mobile" label={assessment.mobileLabel?.trim() || "Mobile"} required={assessment.mobileRequired} value={lead.mobile ?? ""} onChange={(v) => setLead((l) => ({ ...l, mobile: v }))} />
      ) : null}
      {assessment.collectProfession && !gated ? (
        <SelectField label={assessment.professionLabel?.trim() || "Profession"} required={assessment.professionRequired} value={lead.profession ?? ""} options={professionOptionsFor(assessment.professionOptions)} placeholder={assessment.professionPlaceholder?.trim() || "Select your profession"} onChange={(v) => setLead((l) => ({ ...l, profession: v }))} />
      ) : null}
      {assessment.optinFields.map((f) =>
        f.type === "select" ? (
          <SelectField key={f.id} label={f.label} required={f.required} value={optinAnswers[f.id] ?? ""} options={f.options} placeholder="Select…" onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))} />
        ) : (
          <Field key={f.id} qa={`optin:${f.id}`} label={f.label} required={f.required} value={optinAnswers[f.id] ?? ""} onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))} />
        ),
      )}
    </div>
  );

  // Lead-capture-AFTER: the opt-in form on its own step, shown after the questions.
  // -------------------------------------------------------------------------
  // SPLIT lead capture: the three staged screens.
  //
  // Deliberately shaped like the question screens rather than like an opt-in form -
  // no "Almost done" heading, no sub-line promising results, one ask and a button.
  // To the respondent this is a series of questions that happens to include their
  // name, which is the whole reason the split is tolerable at all.
  // -------------------------------------------------------------------------
  if (step === "leadName") {
    const f = nameScreenFields(splitInput);
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitSplitName();
        }}
        className="flex flex-col gap-6"
        data-qa-step="leadName"
      >
        {honeypotInput}
        <h2 className="text-2xl font-bold tracking-tight">
          {STAGE_DEFAULTS.split.nameHeading}
        </h2>
        <div className="flex flex-col gap-4">
          {f.firstName ? (
            <Field
              qa="firstName"
              label={assessment.firstNameLabel?.trim() || "First name"}
              required
              value={lead.firstName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, firstName: v }))}
            />
          ) : null}
          {f.lastName ? (
            <Field
              qa="lastName"
              label={assessment.lastNameLabel?.trim() || "Last name"}
              required
              value={lead.lastName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, lastName: v }))}
            />
          ) : null}
          {f.profession ? (
            <SelectField
              label={assessment.professionLabel?.trim() || "Profession"}
              required
              value={lead.profession ?? ""}
              options={professionOptionsFor(assessment.professionOptions)}
              placeholder={assessment.professionPlaceholder?.trim() || "Select your profession"}
              onChange={(v) => setLead((l) => ({ ...l, profession: v }))}
            />
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle} data-qa-nav="split-name">
          {pending ? "Please wait…" : assessment.startButtonLabel?.trim() || "Continue"}
        </Button>
      </form>
    );
  }

  if (step === "leadEmail") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitSplitEmail();
        }}
        className="flex flex-col gap-6"
        data-qa-step="leadEmail"
      >
        {honeypotInput}
        <h2 className="text-2xl font-bold tracking-tight">
          {STAGE_DEFAULTS.split.emailHeading}
        </h2>
        {/* The one sentence a qualified respondent reads at the moment of most
            investment in the whole funnel. Same copy the opt-in uses. */}
        {qualifiedNote}
        <div className="flex flex-col gap-4">
          <Field
            qa="email"
            label={assessment.emailLabel?.trim() || "Email"}
            type="email"
            required
            value={lead.email ?? ""}
            onChange={(v) => setLead((l) => ({ ...l, email: v }))}
          />
          {assessment.optinFields.map((f) =>
            f.type === "select" ? (
              <SelectField
                key={f.id}
                label={f.label}
                required={f.required}
                value={optinAnswers[f.id] ?? ""}
                options={f.options}
                placeholder="Select…"
                onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))}
              />
            ) : (
              <Field
                key={f.id}
                qa={`optin:${f.id}`}
                label={f.label}
                required={f.required}
                value={optinAnswers[f.id] ?? ""}
                onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))}
              />
            ),
          )}
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle} data-qa-nav="split-email">
          {pending ? "Please wait…" : assessment.startButtonLabel?.trim() || "Continue"}
        </Button>
      </form>
    );
  }

  if (step === "leadPhone") {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submitSplitPhone();
        }}
        className="flex flex-col gap-6"
        data-qa-step="leadPhone"
      >
        {honeypotInput}
        <h2 className="text-2xl font-bold tracking-tight">
          {STAGE_DEFAULTS.split.phoneHeading}
        </h2>
        {/* One field, on purpose: this is the screen between a finished assessment and
            the result, and anything extra here is friction at the worst moment. */}
        <div className="flex flex-col gap-4">
          <Field
            qa="mobile"
            label={assessment.mobileLabel?.trim() || "Phone (WhatsApp)"}
            required
            value={lead.mobile ?? ""}
            onChange={(v) => setLead((l) => ({ ...l, mobile: v }))}
          />
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle} data-qa-nav="split-phone">
          {pending ? "Please wait…" : assessment.resultsButtonLabel?.trim() || "Show my results"}
        </Button>
      </form>
    );
  }

  if (step === "leadForm") {
    return (
      <form onSubmit={submitLead} className="flex flex-col gap-6" data-qa-step="leadForm">
        {honeypotInput}
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">{optin.heading}</h2>
          <p className="text-[var(--muted-foreground)]">{optin.subtext}</p>
        </div>
        {qualifiedNote}
        {leadFieldsBlock}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle} data-qa-nav="optin-submit">
          {pending ? "Please wait…" : assessment.resultsButtonLabel?.trim() || "Show my results"}
        </Button>
      </form>
    );
  }

  if (step === "qualify" && qual) {
    // qualIndex only advances within bounds via pickQualOption, so this is defensive.
    const question = qual.questions[qualIndex] ?? qual.questions[0]!;
    return (
      <div className="flex flex-col gap-6" data-qa-step="qualify">
        {assessment.eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{assessment.eyebrow}</p>
        ) : null}
        {/*
          Title left, section counter right, matching the assessment screens exactly so
          the two halves of the funnel read as one run of questions. Sections rather than
          one running total on purpose: a respondent can see there are two sets and how far
          through each they are, and the numbers stay honest even for someone who never
          reaches section 2, which a single "1 of 20" would not.
        */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{assessment.title}</h1>
            {assessment.subheadline ? (
              <p className="text-[var(--muted-foreground)]">{assessment.subheadline}</p>
            ) : null}
          </div>
          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
            Section 1 ({qualIndex + 1}/{qual.questions.length})
          </span>
        </div>
        <div className="flex flex-col gap-3" data-qa-qual-question={question.id}>
          <Label>
            {question.text}
            {question.type === "text" && !question.required ? (
              <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">(optional)</span>
            ) : null}
          </Label>
          {question.type === "text" ? (
            <>
              <Input
                value={qualTextAnswers[question.id] ?? ""}
                placeholder={question.placeholder || undefined}
                onChange={(e) => setQualTextAnswers((a) => ({ ...a, [question.id]: e.target.value }))}
              />
              {error ? <p className="text-sm text-red-500">{error}</p> : null}
              <Button size="lg" type="button" style={ctaStyle} data-qa-nav="qual-continue" onClick={() => submitQualText(question.id, question.required)}>
                Continue
              </Button>
            </>
          ) : (
            <div className="flex flex-col gap-2">
              {question.options.map((o) => {
                const picked = qualPickedId === o.id;
                return (
                  <Button
                    key={o.id}
                    size="lg"
                    type="button"
                    variant="outline"
                    className="justify-start gap-3 text-left"
                    data-qa-qual-option={o.id}
                    onClick={() => pickQualOption(o)}
                  >
                    <span
                      aria-hidden
                      className={`inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 ${
                        picked ? "border-[#16a34a]" : "border-[var(--muted-foreground)]"
                      }`}
                    >
                      {picked ? <span className="h-2 w-2 rounded-full bg-[#16a34a]" /> : null}
                    </span>
                    <span>{o.label}</span>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  }

  if (step === "capLocked") {
    // Over-cap completion: the lead's answers are stored, but results are unavailable
    // until the workspace upgrades. Neutral, non-alarming copy + a support contact.
    return (
      <div className="flex flex-col gap-6" data-qa-step="capLocked">
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Thanks - your responses are in.</h1>
          <p className="text-[var(--muted-foreground)]">
            Your results aren&apos;t available to view right now. If you&apos;d like your
            results, please reach out and we&apos;ll help you out.
          </p>
          {capLockedSupportEmail ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Contact support:{" "}
              <a
                href={`mailto:${capLockedSupportEmail}`}
                className="font-semibold text-[var(--foreground)] underline"
              >
                {capLockedSupportEmail}
              </a>
            </p>
          ) : (
            <p className="text-sm text-[var(--muted-foreground)]">
              Please contact support for your results.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (step === "disqualified") {
    const dq = currentExit;
    return (
      <div className="flex flex-col gap-6" data-qa-step="disqualified" data-qa-exit={dq?.key ?? ""}>
        <div className="flex flex-col gap-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {dq?.heading?.trim() || "Thanks for your interest."}
          </h1>
          {dq?.subtext?.trim() ? (
            <p className="text-[var(--muted-foreground)]">{dq.subtext}</p>
          ) : null}
          {dq?.bodyHtml?.trim() ? (
            <div
              className="prose prose-sm max-w-none text-[var(--foreground)]"
              // Admin-authored (super-admin) content, same trust as other builder HTML.
              dangerouslySetInnerHTML={{ __html: dq.bodyHtml }}
            />
          ) : null}
        </div>
        {dq?.buttonUrl?.trim() ? (
          <a
            href={dq.buttonUrl}
            className="inline-flex items-center justify-center rounded-md px-6 py-3 text-sm font-semibold text-white"
            style={{ backgroundColor: "#16a34a", ...ctaStyle }}
          >
            {dq.buttonLabel?.trim() || "Continue"}
          </a>
        ) : null}
      </div>
    );
  }

  if (step === "gate" && gate) {
    const isFree = gate.mode === "FREETEXT";
    const gateLabel = gate.label?.trim() || "Which best describes you?";
    const placeholder = gate.placeholder?.trim() || (isFree ? "Start typing…" : "Select…");
    const continueDisabled = isFree ? gate.required && !freeAudience.trim() : !gateChoice;
    return (
      <div className="flex flex-col gap-6" data-qa-step="gate">
        {assessment.eyebrow ? (
          <p className="text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{assessment.eyebrow}</p>
        ) : null}
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight">{assessment.title}</h1>
          {assessment.subheadline ? (
            <p className="text-[var(--muted-foreground)]">{assessment.subheadline}</p>
          ) : null}
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="audience-gate">
            {gateLabel}
            {isFree && !gate.required ? (
              <span className="ml-1 text-xs font-normal text-[var(--muted-foreground)]">(optional)</span>
            ) : null}
          </Label>
          {isFree ? (
            <>
              {(() => {
                const q = freeAudience.trim().toLowerCase();
                // Substring match; show all on focus with empty input. Custom dropdown
                // (not native <datalist>) so it works on mobile + in-app browsers.
                const matches = gate.suggestions
                  .filter((s) => (q ? s.toLowerCase().includes(q) : true))
                  // Don't show a single suggestion identical to what's already typed.
                  .filter((s) => s.toLowerCase() !== q)
                  .slice(0, 8);
                const open = audienceFocused && matches.length > 0;
                return (
                  <div className="relative">
                    <Input
                      id="audience-gate"
                      value={freeAudience}
                      placeholder={placeholder}
                      autoComplete="off"
                      role="combobox"
                      aria-expanded={open}
                      aria-autocomplete="list"
                      onChange={(e) => setFreeAudience(e.target.value)}
                      onFocus={() => setAudienceFocused(true)}
                      // Delay close so a tap on an option registers before blur.
                      onBlur={() => setTimeout(() => setAudienceFocused(false), 150)}
                    />
                    {open ? (
                      <ul className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-auto rounded-md border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
                        {matches.map((s) => (
                          <li key={s}>
                            <button
                              type="button"
                              data-qa-audience-suggestion={s}
                              className="block w-full px-3 py-2 text-left text-sm hover:bg-[var(--muted)] active:bg-[var(--muted)]"
                              // onMouseDown/onTouchStart fire before the input's blur,
                              // so preventDefault keeps focus and the pick lands.
                              onMouseDown={(e) => {
                                e.preventDefault();
                                setFreeAudience(s);
                                setAudienceFocused(false);
                              }}
                              onTouchStart={(e) => {
                                e.preventDefault();
                                setFreeAudience(s);
                                setAudienceFocused(false);
                              }}
                            >
                              {s}
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                );
              })()}
              {gate.suggestions.length > 0 ? (
                <p className="text-xs text-cyan-400">Start typing to see suggestions - or enter your own.</p>
              ) : null}
            </>
          ) : (
            <>
              <div className="relative">
                <select
                  id="audience-gate"
                  value={gateChoice}
                  onChange={(e) => setGateChoice(e.target.value)}
                  className={SELECT_CLASS}
                >
                  <option value="" disabled>{placeholder}</option>
                  {gate.options.map((o) => (
                    <option key={o.key} value={o.key} data-qa-role={o.key}>{o.label}</option>
                  ))}
                </select>
                <SelectChevron />
              </div>
              <p className="text-xs text-cyan-400">Tap to choose from the list ▾</p>
            </>
          )}
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="button" style={ctaStyle} disabled={continueDisabled} onClick={submitGate} data-qa-nav="audience-continue">
          {assessment.startButtonLabel?.trim() || "Continue"}
        </Button>
      </div>
    );
  }

  if (step === "intro") {
    // A custom introNotice overrides the auto retake message entirely.
    const retakeNotice =
      assessment.introNotice && assessment.introNotice.trim()
        ? assessment.introNotice
        : assessment.retakePolicy === "NEVER"
          ? "Please answer honestly - this assessment can be taken only once."
          : assessment.retakePolicy === "DELAYED"
            ? `Please answer honestly in one sitting. Once you submit, you won't be able to retake this assessment for ${assessment.retakeDays} day${assessment.retakeDays === 1 ? "" : "s"}.`
            : null;
    // After a qualification gate the respondent is mid-funnel, so the cover image, eyebrow,
    // title, subheadline and description are an interruption rather than an opening. They
    // are dropped; the retake notice below is kept because it is a warning, not decoration.
    // In lead-FIRST mode this screen is also the opt-in form, which is why the copy is
    // suppressed here rather than the whole step being skipped.
    const landing = (
      <>
        {assessment.coverImageUrl && !gateRan ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assessment.coverImageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
        ) : null}
        <div className={gateRan ? "hidden" : "flex flex-col gap-2"}>
          {assessment.eyebrow ? (
            <p className="text-sm font-semibold uppercase tracking-wide text-[#D4AF37]">{assessment.eyebrow}</p>
          ) : null}
          <h1 className="text-3xl font-bold tracking-tight">{assessment.title}</h1>
          {assessment.subheadline ? (
            <p className="text-lg font-medium text-[var(--foreground)]">{assessment.subheadline}</p>
          ) : null}
          {assessment.description ? (
            <p className="whitespace-pre-line text-[var(--muted-foreground)]">{assessment.description}</p>
          ) : null}
        </div>
        {retakeNotice ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[var(--foreground)]">{retakeNotice}</p>
        ) : null}
        {/* Last, so it sits directly above the fields: after a gate the landing copy
            above is hidden, which leaves this as the first thing a qualified person
            reads before being asked for anything. */}
        {qualifiedNote}
      </>
    );

    // Lead-capture-AFTER: show the landing + a Start button; the opt-in form appears
    // after the questions (the "leadForm" step). No lead fields here.
    if (assessment.leadCaptureAfter) {
      return (
        <div className="flex flex-col gap-6" data-qa-step="intro" data-qa-optin="after">
          {landing}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button
            size="lg"
            type="button"
            disabled={pending}
            style={ctaStyle}
            onClick={() => {
              setError(null);
              setScreenIndex(0);
              setPathStack([0]);
              // No scored questions: go straight to whatever comes after them.
              if (!hasScoredQuestions) {
                setStep(assessment.leadCaptureAfter ? "leadForm" : "questions");
                return;
              }
              setStep("questions");
            }}
            data-qa-nav="start"
          >
            {assessment.startButtonLabel?.trim() || "Start"}
          </Button>
        </div>
      );
    }

    // Lead-FIRST with nothing to ask: the landing and a Start button that begins the
    // submission straight away. Same reason as above - an empty form is not a screen.
    if (!collectsAnything) {
      return (
        <div className="flex flex-col gap-6" data-qa-step="intro" data-qa-optin="none">
          {landing}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button
            size="lg"
            type="button"
            disabled={pending}
            style={ctaStyle}
            onClick={() => submitLead()}
            data-qa-nav="start"
          >
            {assessment.startButtonLabel?.trim() || "Start"}
          </Button>
        </div>
      );
    }

    // Default: landing + opt-in form on one screen.
    return (
      <form onSubmit={submitLead} className="flex flex-col gap-6" data-qa-step="intro" data-qa-optin="first">
        {honeypotInput}
        {landing}

        <div className="flex flex-col gap-4">
          {assessment.collectFirstName ? (
            <Field
              qa="firstName"
              label={assessment.firstNameLabel?.trim() || "First name"}
              required={assessment.firstNameRequired}
              value={lead.firstName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, firstName: v }))}
            />
          ) : null}
          {assessment.collectLastName ? (
            <Field
              qa="lastName"
              label={assessment.lastNameLabel?.trim() || "Last name"}
              required={assessment.lastNameRequired}
              value={lead.lastName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, lastName: v }))}
            />
          ) : null}
          {assessment.collectEmail ? (
            <Field
              qa="email"
              label={assessment.emailLabel?.trim() || "Email"}
              type="email"
              required={assessment.emailRequired}
              value={lead.email ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, email: v }))}
            />
          ) : null}
          {assessment.collectMobile ? (
            <Field
              qa="mobile"
              label={assessment.mobileLabel?.trim() || "Mobile"}
              required={assessment.mobileRequired}
              value={lead.mobile ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, mobile: v }))}
            />
          ) : null}
          {assessment.collectProfession && !gated ? (
            <SelectField
              label={assessment.professionLabel?.trim() || "Profession"}
              required={assessment.professionRequired}
              value={lead.profession ?? ""}
              options={professionOptionsFor(assessment.professionOptions)}
              placeholder={assessment.professionPlaceholder?.trim() || "Select your profession"}
              onChange={(v) => setLead((l) => ({ ...l, profession: v }))}
            />
          ) : null}

          {assessment.optinFields.map((f) =>
            f.type === "select" ? (
              <SelectField
                key={f.id}
                label={f.label}
                required={f.required}
                value={optinAnswers[f.id] ?? ""}
                options={f.options}
                placeholder="Select…"
                onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))}
              />
            ) : (
              <Field
                key={f.id}
                qa={`optin:${f.id}`}
                label={f.label}
                required={f.required}
                value={optinAnswers[f.id] ?? ""}
                onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))}
              />
            ),
          )}
        </div>

        {assessment.paidMode && assessment.paymentIntroText ? (
          <div className="rounded-lg border border-green-600/40 bg-green-600/10 px-4 py-3 text-center text-sm font-medium whitespace-pre-line">
            {assessment.paymentIntroText}
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle} data-qa-nav="optin-submit">
          {pending ? "Starting…" : assessment.startButtonLabel?.trim() || "Start"}
        </Button>
      </form>
    );
  }

  if (step === "locked" && lockout) {
    const lastDate = fmtDate(lockout.lastCompletedAt);
    const nextDate = fmtDate(lockout.nextAvailableAt);
    return (
      <div className="flex flex-col gap-6" data-qa-step="locked">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            {lockout.policy === "NEVER"
              ? STAGE_DEFAULTS.onceOnly.heading
              : STAGE_DEFAULTS.alreadyCompleted.heading}
          </h2>
          {lockout.policy === "NEVER" ? (
            <p className="text-[var(--muted-foreground)]">{STAGE_DEFAULTS.onceOnly.body}</p>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              {STAGE_DEFAULTS.alreadyCompleted.body}
              {nextDate ? (
                <>
                  {" "}
                  {STAGE_DEFAULTS.alreadyCompleted.nextAvailablePrefix} <strong>{nextDate}</strong>.
                </>
              ) : null}
            </p>
          )}
          {lastDate ? (
            <p className="text-sm text-[var(--muted-foreground)]">Completed on {lastDate}.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {/* Offered only when the server confirmed there is a result to send. The
              screen has already stated that a completed run exists, so following the
              offer with "if a previous result exists" read as the app contradicting
              itself one line later. */}
          {assessment.collectEmail && lockout.resultAvailable ? (
            emailSent ? (
              <p className="text-sm">
                Sent. Your previous result is on its way to the email address you used.
              </p>
            ) : (
              <Button onClick={emailPreviousResults} disabled={pending}>
                {pending ? "Sending…" : "Email My Previous Results"}
              </Button>
            )
          ) : null}
          {assessment.trainingUrl ? (
            <a
              href={assessment.trainingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
            >
              Watch Recommended Training
            </a>
          ) : null}
        </div>
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
      </div>
    );
  }

  if (step === "evaluating") {
    // Seconds come from where this run ENDS, not from the step. A destination redirect
    // gets the owner's anticipation countdown; a signup handoff, a result page or a
    // payment screen gets 0 and shows a plain spinner, because the next screen appears
    // as soon as the server answers. See features/assessment/flow/stages.
    return <EvaluatingCountdown redirectUrl={redirectUrl} seconds={waitSeconds(flowInput)} />;
  }

  if (step === "details") {
    const setDetail = (id: string, v: string) => setDetailAnswers((prev) => ({ ...prev, [id]: v }));
    return (
      <div className="flex flex-col gap-6" data-qa-step="details">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            {assessment.preResultHeading?.trim() || "A few last details"}
          </h2>
          {assessment.preResultSubtext ? (
            <p className="whitespace-pre-line text-[var(--muted-foreground)]">{assessment.preResultSubtext}</p>
          ) : null}
        </div>

        {assessment.preResultFields.map((field) => (
          <div key={field.id} className="flex flex-col gap-2">
            <Label htmlFor={`pr-${field.id}`}>
              {field.label} {field.required ? <span className="text-red-500">*</span> : null}
            </Label>
            {field.type === "select" ? (
              <select
                id={`pr-${field.id}`}
                value={detailAnswers[field.id] ?? ""}
                onChange={(e) => setDetail(field.id, e.target.value)}
                className="h-11 rounded-md border border-[var(--border)] bg-transparent px-3 text-base"
              >
                <option value="">Select…</option>
                {field.options.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            ) : (
              <Input
                id={`pr-${field.id}`}
                value={detailAnswers[field.id] ?? ""}
                onChange={(e) => setDetail(field.id, e.target.value)}
              />
            )}
          </div>
        ))}

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" onClick={submitDetails} disabled={pending} style={ctaStyle}>
          {pending ? "Please wait…" : "Continue"}
        </Button>
      </div>
    );
  }

  // step === "questions" - paginate the questions by the display mode.
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const leadContact = [lead.email, lead.mobile].filter(Boolean).join(" · ");

  type QGroup = { cat: (typeof assessment.categories)[number]; qs: (typeof assessment.categories)[number]["questions"] };
  // Categories are grouped by PAGE (1 = assessment, 2 = queries). Page 1's screens come
  // first, then page 2's - so the two scored pages are always visually separate.
  const pageGroups = [1, 2]
    .map((p) => assessment.categories.filter((c) => (c.page ?? 1) === p))
    .filter((g) => g.length > 0);
  const screens: QGroup[][] = pageGroups.flatMap((cats) =>
    assessment.questionDisplayMode === "CATEGORY"
      ? cats.map((c) => [{ cat: c, qs: c.questions }])
      : assessment.questionDisplayMode === "SINGLE"
        ? cats.flatMap((c) => c.questions.map((q) => [{ cat: c, qs: [q] }]))
        : [cats.map((c) => ({ cat: c, qs: c.questions }))],
  );
  const lastIdx = Math.max(0, screens.length - 1);
  // Routing (SINGLE) navigates by a stack of visited screen indices; other modes
  // step linearly by screenIndex.
  const idx = routingActive
    ? Math.min(pathStack[pathStack.length - 1] ?? 0, lastIdx)
    : Math.min(screenIndex, lastIdx);
  // Routing: where the CURRENT answer leads (END => this screen is terminal).
  const currentChosen = routingActive ? answers[spine[idx]?.id ?? ""] : undefined;
  const routedNext = routingActive ? nextIndex(idx, currentChosen, spine, byOption) : null;
  const isLast = routingActive ? routedNext === "END" : idx >= lastIdx;
  const current = screens[idx] ?? [];
  const currentRequiredLeft = current.flatMap((g) => g.qs).filter((q) => q.required && !isAnswered(q)).length;
  const currentQs = current.flatMap((g) => g.qs);
  const currentOptionalAndEmpty =
    currentQs.length > 0 && currentQs.every((q) => !q.required && !isAnswered(q));

  const goNext = () => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    if (currentRequiredLeft > 0) {
      setError(`Please answer all required questions (${currentRequiredLeft} left).`);
      return;
    }
    const screenActualError = current
      .flatMap((g) => g.qs)
      .reduce<string | null>((found, q) => {
        if (found || !q.scoringRole || !CLINIC_ACTUAL_FIELD[q.scoringRole]) return found;
        return actualNumberError(
          q.scoringRole,
          unitForQuestion(q),
          actualAnswers[q.id] ?? "",
        );
      }, null);
    if (screenActualError) {
      setError(screenActualError);
      return;
    }
    setError(null);
    if (routingActive) {
      const nxt = nextIndex(idx, currentChosen, spine, byOption);
      if (nxt !== "END") setPathStack((st) => [...st, nxt]);
      return;
    }
    setScreenIndex((i) => Math.min(i + 1, lastIdx));
  };
  const goBack = () => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    setError(null);
    if (routingActive) {
      setPathStack((st) => (st.length > 1 ? st.slice(0, -1) : st));
      return;
    }
    setScreenIndex((i) => Math.max(i - 1, 0));
  };

  // Does the current screen carry an optional "actual number" field? If so we do
  // NOT auto-advance - the respondent may still want to type that number.
  const currentHasActualField = current
    .flatMap((g) => g.qs)
    .some((q) => q.scoringRole != null && CLINIC_ACTUAL_FIELD[q.scoringRole] != null);

  // Record a chosen option and, in paginated modes, auto-advance once the screen
  // is fully answered. Never in ALL ("one page") mode, never on the last screen
  // (Submit stays a deliberate tap), never on clinic screens with an exact-number
  // field. Manual Next/Back remain and cancel any pending advance.
  const selectAnswer = (questionId: string, optionId: string) => {
    const next = { ...answers, [questionId]: optionId };
    setAnswers(next);
    if (assessment.questionDisplayMode === "ALL" || currentHasActualField) return;
    // Routing (SINGLE): resolve the branch from THIS choice. A terminal choice
    // (SKIP_TO_END / last question) reveals Submit instead of auto-advancing.
    if (routingActive) {
      const nxt = nextIndex(idx, optionId, spine, byOption);
      if (nxt === "END") return;
      if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
      setError(null);
      autoAdvanceRef.current = setTimeout(() => {
        setPathStack((st) => [...st, nxt]);
      }, 250);
      return;
    }
    // The last screen normally keeps its Submit as a deliberate tap. With the switch
    // on it behaves like every other screen, because that exception is how someone
    // answers everything and still never reaches the opt-in form.
    if (isLast && !assessment.autoAdvanceLastScreen) return;
    const requiredLeft = current
      .flatMap((g) => g.qs)
      .filter((q) => (q.type === "FREE_TEXT" ? !isAnswered(q) : !next[q.id]) && q.required).length;
    if (requiredLeft > 0) return;
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    setError(null);
    autoAdvanceRef.current = setTimeout(() => {
      // On the last screen there is nowhere further to page to, so advancing means
      // submitting - the same thing the button does, without the tap.
      if (isLast) submitAnswers();
      else setScreenIndex((i) => Math.min(i + 1, lastIdx));
    }, 250);
  };

  return (
    <div className="flex flex-col gap-8" data-qa-step="questions">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{assessment.title}</h2>
        {screens.length > 1 ? (
          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
            {/* Numbered as section 2 ONLY when a gate actually ran, so an assessment
                without one is not told it is the second of something. Routing makes the
                path length vary, so it shows the step reached rather than a total. */}
            {gateRan
              ? routingActive
                ? `Section 2 (${pathStack.length})`
                : `Section 2 (${idx + 1}/${screens.length})`
              : routingActive
                ? `Step ${pathStack.length}`
                : `Step ${idx + 1} of ${screens.length}`}
          </span>
        ) : null}
      </div>
      {leadName || leadContact ? (
        <div className="rounded-lg border bg-[var(--muted)] px-4 py-2 text-sm">
          {leadName ? <span className="font-medium">{leadName}</span> : null}
          {leadName && leadContact ? <span className="text-[var(--muted-foreground)]"> - </span> : null}
          {leadContact ? <span className="text-[var(--muted-foreground)]">{leadContact}</span> : null}
        </div>
      ) : null}
      {current.map((g) => (
        <div key={`${g.cat.id}-${g.qs[0]?.id ?? ""}`} className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold">{g.cat.name}</h3>
            {g.cat.description && assessment.questionDisplayMode !== "SINGLE" ? (
              <p className="text-sm text-[var(--muted-foreground)]">{g.cat.description}</p>
            ) : null}
          </div>
          {g.qs.map((q) => (
            <fieldset key={q.id} className="flex flex-col gap-2 rounded-lg border p-4" data-qa-question={q.id}>
              <legend className="px-1 text-sm font-medium">
                {q.text} {q.required ? <span className="text-red-500">*</span> : null}
              </legend>
              {q.type === "FREE_TEXT" ? (
                <div className="flex flex-col gap-1">
                  <Textarea
                    data-qa-text={q.id}
                    rows={4}
                    maxLength={FREE_TEXT_ANSWER_MAX}
                    placeholder="Type your answer"
                    value={textAnswers[q.id] ?? ""}
                    onChange={(e) => setTextAnswers((t) => ({ ...t, [q.id]: e.target.value }))}
                  />
                  {!q.required ? (
                    <p className="text-xs text-[var(--muted-foreground)]">
                      Optional. Leave it blank to move on.
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {q.options.map((o) => (
                    <label key={o.id} className="flex items-center gap-3 text-sm">
                      <input
                        type="radio"
                        name={q.id}
                        data-qa-option={o.id}
                        checked={answers[q.id] === o.id}
                        onChange={() => selectAnswer(q.id, o.id)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
              )}
              {(() => {
                const actualField = q.scoringRole ? CLINIC_ACTUAL_FIELD[q.scoringRole] : undefined;
                if (!actualField || !q.scoringRole) return null;
                const unit = unitForQuestion(q);
                const aff = unitAffordance(unit);
                const raw = actualAnswers[q.id] ?? "";
                const err = actualNumberError(q.scoringRole, unit, raw);
                return (
                  <div className="mt-1 flex flex-col gap-1 border-t pt-3">
                    <label htmlFor={`actual-${q.id}`} className="text-xs text-[var(--muted-foreground)]">
                      {actualField.prompt} Enter it below (optional) - otherwise we&apos;ll use the
                      midpoint of your selected range. {aff.hint}
                    </label>
                    <div className="flex items-center gap-2">
                      {aff.prefix ? <span className="text-sm text-[var(--muted-foreground)]">{aff.prefix}</span> : null}
                      <Input
                        id={`actual-${q.id}`}
                        type="text"
                        inputMode="numeric"
                        placeholder={actualField.placeholder}
                        value={raw}
                        onChange={(e) =>
                          setActualAnswers((a) => ({ ...a, [q.id]: e.target.value.replace(/[^0-9]/g, "") }))
                        }
                        className="max-w-[160px]"
                        aria-invalid={err ? true : undefined}
                      />
                      {aff.suffix ? <span className="text-sm text-[var(--muted-foreground)]">{aff.suffix}</span> : null}
                    </div>
                    {err ? <p className="text-xs text-red-500">{err}</p> : null}
                  </div>
                );
              })()}
            </fieldset>
          ))}
        </div>
      ))}
      {isLast && assessment.paidMode && assessment.paymentHeadline ? (
        <p className="whitespace-pre-line text-center text-lg font-semibold">{assessment.paymentHeadline}</p>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        {(routingActive ? pathStack.length > 1 : idx > 0) ? (
          <Button size="lg" variant="outline" onClick={goBack} disabled={pending} data-qa-nav="back">
            Back
          </Button>
        ) : (
          <span />
        )}
        {isLast ? (
          <Button size="lg" onClick={submitAnswers} disabled={pending} style={ctaStyle} data-qa-nav="submit">
            {pending
              ? "Submitting…"
              : assessment.pages.length === 0 && assessment.paidMode && assessment.paymentButtonLabel
                ? assessment.paymentButtonLabel // legacy: pay on submit when no result page
                : "Submit"}
          </Button>
        ) : (
          <Button size="lg" onClick={goNext} disabled={pending} style={ctaStyle} data-qa-nav="next">
            {/* An optional screen nobody has answered says Skip, because that is what
                the button does there. A survey whose follow-ups are optional has to
                SHOW that they are, or "optional" is only true in the database. */}
            {currentOptionalAndEmpty ? "Skip" : "Next"}
          </Button>
        )}
      </div>
    </div>
  );
}

/**
 * One big spinner shown from submit until the redirect, with the countdown number
 * centered INSIDE the ring. The number is a separate (non-rotating) layer so it
 * stays upright while the ring spins.
 *
 * On the destination flow `redirectUrl` is set once scoring resolves; the redirect
 * fires only after the timer hits 0 AND the URL is ready (minimum wait, never cuts
 * scoring short). On other flows `redirectUrl` stays null and the parent swaps the
 * step when ready, so the countdown is purely cosmetic.
 */
function EvaluatingCountdown({ redirectUrl, seconds }: { redirectUrl: string | null; seconds?: number }) {
  // Per-assessment duration; fall back to the constant for any bad/missing value.
  const start = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds as number)) : VSL_COUNTDOWN_SECONDS;
  // 0 means "no anticipation timer on this path" (see flow/stages.waitSeconds): show
  // the spinner alone. A ✓ that appears instantly and then sits there reads as the
  // page having finished and stalled, which is exactly what it looked like on the
  // signup handoff.
  const counting = start > 0;
  const [n, setN] = useState(start);
  useEffect(() => {
    if (n <= 0) return;
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);
  useEffect(() => {
    if (n <= 0 && redirectUrl) window.location.replace(redirectUrl);
  }, [n, redirectUrl]);
  return (
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center" data-qa-step="evaluating">
      <div className="relative h-36 w-36">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
        {counting ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-5xl font-bold tabular-nums">{n > 0 ? n : "✓"}</span>
          </div>
        ) : null}
      </div>
      <p className="text-lg font-medium">{STAGE_DEFAULTS.evaluating.label}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
  qa,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  /** Stable handle for the verification harness (qa/). Inert in the browser. */
  qa?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label} {required ? <span className="text-red-500">*</span> : null}
      </Label>
      <Input
        type={type}
        value={value}
        required={required}
        data-qa-field={qa}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** Shared native-<select> styling. appearance-none + a chevron + pointer cursor
 *  make it obviously a tappable dropdown (native selects otherwise read as static
 *  boxes on the dark theme, so respondents miss them). border-2 + hover + shadow
 *  give it a clear interactive affordance. */
const SELECT_CLASS =
  "flex h-11 w-full appearance-none cursor-pointer rounded-md border-2 border-cyan-500 bg-[var(--background)] px-3 pr-10 text-base text-[var(--foreground)] shadow-sm transition-colors hover:border-cyan-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50";

/** Down-chevron overlaid on a native select (pointer-events-none so clicks fall
 *  through to the select). Wrap the <select> in a `relative` container. */
function SelectChevron() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-cyan-400"
    >
      <path d="M6 8l4 4 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Native <select> styled to match Input (dependency-free, mobile-first). The
 *  required empty option keeps the browser's "please select" validation honest. */
function SelectField({
  label,
  value,
  onChange,
  required,
  options,
  placeholder = "Select…",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  options: readonly string[];
  placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-2">
      <Label>
        {label} {required ? <span className="text-red-500">*</span> : null}
      </Label>
      <div className="relative">
        <select
          value={value}
          required={required}
          onChange={(e) => onChange(e.target.value)}
          className={SELECT_CLASS}
        >
          <option value="" disabled={required}>
            {placeholder}
          </option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        <SelectChevron />
      </div>
    </div>
  );
}

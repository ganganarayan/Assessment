"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import {
  startSubmission,
  completeSubmission,
  requestPreviousResults,
  saveDraftAnswers,
} from "@/features/assessment/actions/submission";
import { recordOptinView } from "@/features/assessment/actions/track";
import { getResultForPages, type PageResultData } from "@/features/assessment/actions/pages";
import { type AssessmentPageData } from "@/features/assessment/pages/blocks";
import { openRazorpayCheckout } from "@/lib/payments/checkout-client";
import { type PaymentCheckout } from "@/lib/payments/types";
import { ResultPages } from "@/features/assessment/components/public/result-pages";
import { type LeadInput, professionOptionsFor, type PreResultField } from "@/features/assessment/schemas";
import { pixelTrack, pixelTrackCustom } from "@/lib/pixel";
import { detectUnitFromQuestion, isClinicRole, type ClinicRole } from "@/lib/scoring/clinic-audit";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PublicOption { id: string; label: string; value: number }
export interface PublicQuestion {
  id: string;
  text: string;
  required: boolean;
  /** CLINIC_AUDIT only: the funnel role this question feeds, e.g. "ENQUIRIES". Drives
   *  the optional "know your actual number?" field below the range choice. */
  scoringRole: string | null;
  scoringUnit: string | null;
  options: PublicOption[];
}

/** CLINIC_AUDIT numeric roles a respondent might know an exact figure for — the
 *  "actual number" field renders below the range choice for these only. Excludes
 *  UPLIFT_BOOKRATE (behavioral — response speed/follow-up — not a number to type). */
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

/** Reject an entry that can't be what they meant — the guard that would have
 *  caught "7" typed into a percentage field when the question said "out of 10". */
function actualNumberError(role: string, unit: string, raw: string): string | null {
  const n = Number(raw);
  if (!raw.trim() || !Number.isFinite(n)) return null; // blank is fine — we use the range
  if (n <= 0) return "Enter a number greater than zero.";
  if (unit === "PER_10" && n > 10) return "This question is out of 10 — enter a number from 1 to 10.";
  if (unit === "PER_100" && n > 100) return "Enter it as a percentage — 100 or less.";
  // A percentage this low is nearly always an "out of 10" answer typed into a
  // percent field (7 meaning 7-in-10). Ask, rather than silently mis-scoring.
  if (unit === "PER_100" && (role === "SHOWUP_RATE" || role === "CLOSE_RATE") && n <= 10) {
    return `That reads as ${n}% — fewer than ${n} in every 100. If you meant ${n} out of 10, enter ${n * 10}.`;
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
  optinFields: PreResultField[];
  introNotice: string | null;
  startButtonLabel: string | null;
  paidMode: boolean;
  /** Anticipation countdown (seconds) after Submit before the destination/VSL loads. */
  vslCountdownSeconds: number;
  questionDisplayMode: "ALL" | "CATEGORY" | "SINGLE";
  paymentHeadline: string | null;
  paymentButtonLabel: string | null;
  paymentIntroText: string | null;
  categories: PublicCategory[];
  pages: AssessmentPageData[];
}

type Step = "intro" | "questions" | "leadForm" | "details" | "locked" | "evaluating" | "resultPages";

/** Anticipation countdown shown after Submit before the VSL/destination loads.
 *  Single source of truth; promote to a per-assessment field if it needs to vary. */
const VSL_COUNTDOWN_SECONDS = 10;

interface Lockout {
  policy: "DELAYED" | "NEVER";
  lastCompletedAt: string | null;
  nextAvailableAt: string | null;
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

export function AssessmentRunner({
  assessment,
  attribution,
  preview,
}: {
  assessment: PublicAssessment;
  /** UTM + click-id params from the landing URL; forwarded to startSubmission. */
  attribution?: Record<string, string>;
  /** Admin preview flag (?preview=1); server verifies the caller before bypassing. */
  preview?: boolean;
}) {
  const [step, setStep] = useState<Step>("intro");
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
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    profession: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // CLINIC_AUDIT only: the respondent's typed exact number per scored question,
  // keyed by questionId (raw digit string; blank = use the range's midpoint).
  const [actualAnswers, setActualAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<Lockout | null>(null);
  const [screenIndex, setScreenIndex] = useState(0); // current question page (paginated modes)
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

  // Autosave progress (debounced) so a returning unpaid respondent resumes where
  // they left off. Only while answering, only once they've picked something.
  useEffect(() => {
    if (preview || step !== "questions" || !submissionId) return;
    if (Object.keys(answers).length === 0) return;
    const t = setTimeout(() => {
      void saveDraftAnswers(
        submissionId,
        Object.entries(answers).map(([questionId, optionId]) => ({ questionId, optionId })),
        editToken ?? undefined,
      ).catch(() => {});
    }, 800);
    return () => clearTimeout(t);
  }, [answers, submissionId, step, preview, editToken]);

  const questions = assessment.categories.flatMap((c) => c.questions);
  const requiredUnanswered = questions.filter(
    (q) => q.required && !answers[q.id],
  ).length;
  /** First invalid typed actual number, if any — a wrong unit here silently skews
   *  every figure on the result, so it must be corrected before submitting. */
  const firstActualError = questions.reduce<string | null>((found, q) => {
    if (found || !q.scoringRole || !CLINIC_ACTUAL_FIELD[q.scoringRole]) return found;
    return actualNumberError(
      q.scoringRole,
      unitForQuestion(q),
      actualAnswers[q.id] ?? "",
    );
  }, null);

  // Honeypot input ref — hidden from humans; a filled value marks a bot opt-in.
  const hpRef = useRef<HTMLInputElement>(null);
  // Pending auto-advance timer (paginated modes): picking an option moves to the
  // next screen after a short beat. Held in a ref so a re-selection or a manual
  // Next/Back cancels the in-flight advance instead of double-firing.
  const autoAdvanceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function submitLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
      const res = await startSubmission(assessment.slug, lead, attribution, preview, honeypot, optin);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      if (res.data?.status === "locked") {
        setLockout({
          policy: res.data.policy,
          lastCompletedAt: res.data.lastCompletedAt,
          nextAvailableAt: res.data.nextAvailableAt,
        });
        setStep("locked");
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
      if (res.data?.status === "started" && res.data.answers) {
        setAnswers(res.data.answers);
      }
      // Lead-capture-after: questions are already answered — go straight to the
      // pre-results details (if any) or complete now, using the FRESH ids.
      if (assessment.leadCaptureAfter) {
        if (assessment.preResultFields.length > 0) {
          setStep("details");
        } else {
          runCompletion(undefined, newSid ?? undefined, newTok ?? undefined);
        }
        return;
      }
      setScreenIndex(0); // start at the first question page
      setStep("questions");
    });
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

  function submitAnswers() {
    setError(null);
    if (requiredUnanswered > 0) {
      setError(`Please answer all required questions (${requiredUnanswered} left).`);
      return;
    }
    if (firstActualError) {
      setError(firstActualError);
      return;
    }
    // Lead-capture-after: the questions ran anonymously; now collect the lead (which
    // creates the submission), then complete.
    if (assessment.leadCaptureAfter && !submissionId) {
      setError(null);
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
      answers: Object.entries(answers).map(([questionId, optionId]) => ({
        questionId,
        optionId,
      })),
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
      // Meta Pixel: assessment finished (custom event) — fire before the
      // redirect, ONLY for the winning completion (server returns an eventId
      // then). The eventId dedups against the server-side CAPI event.
      if (res.data?.eventId) {
        pixelTrackCustom("AssessmentCompleted", { content_name: assessment.title }, res.data.eventId);
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
        // Free fallback destination only — in paid mode the button pays, never
        // redirects to the (free) result.
        setPageResultDest(assessment.paidMode ? null : (res.data?.resultUrl ?? null));
        const r = await getResultForPages(sid);
        if (r.ok && r.data) setPageResult(r.data);
        setStep("resultPages");
        return;
      }
      // Paid mode: take payment instead of going to the VSL/result (results are
      // already stored; after paying, the user lands on the VSL with the token).
      // Razorpay Checkout opens with the lead's details prefilled — no form to fill;
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
      // scoring) and redirects once it elapses AND this URL is ready — guaranteeing
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
    // result — surface an error so they can retry.
    if (assessment.paidMode) {
      setPayError("We couldn't start the payment just now. Please try again.");
      return;
    }
    if (pageResultDest) {
      const u = pageResultDest + (pageResultDest.includes("?") ? "&" : "?") + "event=1";
      window.location.replace(u);
    }
  }

  if (step === "resultPages") {
    return (
      <ResultPages
        pages={assessment.pages}
        result={pageResult ?? { overallBandTitle: null, overallBandLevel: null, categories: [] }}
        onPay={payFromPage}
        payPending={payPending}
        payError={payError}
      />
    );
  }

  // Reusable pieces of the opt-in form — shown on the intro screen (lead-first) OR on
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
        <Field label={assessment.firstNameLabel?.trim() || "First name"} required={assessment.firstNameRequired} value={lead.firstName ?? ""} onChange={(v) => setLead((l) => ({ ...l, firstName: v }))} />
      ) : null}
      {assessment.collectLastName ? (
        <Field label={assessment.lastNameLabel?.trim() || "Last name"} required={assessment.lastNameRequired} value={lead.lastName ?? ""} onChange={(v) => setLead((l) => ({ ...l, lastName: v }))} />
      ) : null}
      {assessment.collectEmail ? (
        <Field label={assessment.emailLabel?.trim() || "Email"} type="email" required={assessment.emailRequired} value={lead.email ?? ""} onChange={(v) => setLead((l) => ({ ...l, email: v }))} />
      ) : null}
      {assessment.collectMobile ? (
        <Field label={assessment.mobileLabel?.trim() || "Mobile"} required={assessment.mobileRequired} value={lead.mobile ?? ""} onChange={(v) => setLead((l) => ({ ...l, mobile: v }))} />
      ) : null}
      {assessment.collectProfession ? (
        <SelectField label={assessment.professionLabel?.trim() || "Profession"} required={assessment.professionRequired} value={lead.profession ?? ""} options={professionOptionsFor(assessment.professionOptions)} placeholder={assessment.professionPlaceholder?.trim() || "Select your profession"} onChange={(v) => setLead((l) => ({ ...l, profession: v }))} />
      ) : null}
      {assessment.optinFields.map((f) =>
        f.type === "select" ? (
          <SelectField key={f.id} label={f.label} required={f.required} value={optinAnswers[f.id] ?? ""} options={f.options} placeholder="Select…" onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))} />
        ) : (
          <Field key={f.id} label={f.label} required={f.required} value={optinAnswers[f.id] ?? ""} onChange={(v) => setOptinAnswers((prev) => ({ ...prev, [f.id]: v }))} />
        ),
      )}
    </div>
  );

  // Lead-capture-AFTER: the opt-in form on its own step, shown after the questions.
  if (step === "leadForm") {
    return (
      <form onSubmit={submitLead} className="flex flex-col gap-6">
        {honeypotInput}
        <div className="flex flex-col gap-1">
          <h2 className="text-2xl font-bold tracking-tight">Almost done</h2>
          <p className="text-[var(--muted-foreground)]">Enter your details to see your results.</p>
        </div>
        {leadFieldsBlock}
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle}>
          {pending ? "Please wait…" : "See my results"}
        </Button>
      </form>
    );
  }

  if (step === "intro") {
    // A custom introNotice overrides the auto retake message entirely.
    const retakeNotice =
      assessment.introNotice && assessment.introNotice.trim()
        ? assessment.introNotice
        : assessment.retakePolicy === "NEVER"
          ? "Please answer honestly — this assessment can be taken only once."
          : assessment.retakePolicy === "DELAYED"
            ? `Please answer honestly in one sitting. Once you submit, you won't be able to retake this assessment for ${assessment.retakeDays} day${assessment.retakeDays === 1 ? "" : "s"}.`
            : null;
    const landing = (
      <>
        {assessment.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={assessment.coverImageUrl} alt="" className="aspect-video w-full rounded-lg object-cover" />
        ) : null}
        <div className="flex flex-col gap-2">
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
      </>
    );

    // Lead-capture-AFTER: show the landing + a Start button; the opt-in form appears
    // after the questions (the "leadForm" step). No lead fields here.
    if (assessment.leadCaptureAfter) {
      return (
        <div className="flex flex-col gap-6">
          {landing}
          {error ? <p className="text-sm text-red-500">{error}</p> : null}
          <Button
            size="lg"
            type="button"
            disabled={pending}
            style={ctaStyle}
            onClick={() => { setError(null); setScreenIndex(0); setStep("questions"); }}
          >
            {assessment.startButtonLabel?.trim() || "Start"}
          </Button>
        </div>
      );
    }

    // Default: landing + opt-in form on one screen.
    return (
      <form onSubmit={submitLead} className="flex flex-col gap-6">
        {honeypotInput}
        {landing}

        <div className="flex flex-col gap-4">
          {assessment.collectFirstName ? (
            <Field
              label={assessment.firstNameLabel?.trim() || "First name"}
              required={assessment.firstNameRequired}
              value={lead.firstName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, firstName: v }))}
            />
          ) : null}
          {assessment.collectLastName ? (
            <Field
              label={assessment.lastNameLabel?.trim() || "Last name"}
              required={assessment.lastNameRequired}
              value={lead.lastName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, lastName: v }))}
            />
          ) : null}
          {assessment.collectEmail ? (
            <Field
              label={assessment.emailLabel?.trim() || "Email"}
              type="email"
              required={assessment.emailRequired}
              value={lead.email ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, email: v }))}
            />
          ) : null}
          {assessment.collectMobile ? (
            <Field
              label={assessment.mobileLabel?.trim() || "Mobile"}
              required={assessment.mobileRequired}
              value={lead.mobile ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, mobile: v }))}
            />
          ) : null}
          {assessment.collectProfession ? (
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
        <Button size="lg" type="submit" disabled={pending} style={ctaStyle}>
          {pending ? "Starting…" : assessment.startButtonLabel?.trim() || "Start"}
        </Button>
      </form>
    );
  }

  if (step === "locked" && lockout) {
    const lastDate = fmtDate(lockout.lastCompletedAt);
    const nextDate = fmtDate(lockout.nextAvailableAt);
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <h2 className="text-2xl font-bold tracking-tight">
            You have already completed this assessment
          </h2>
          {lockout.policy === "NEVER" ? (
            <p className="text-[var(--muted-foreground)]">
              This assessment can be taken only once.
            </p>
          ) : (
            <p className="text-[var(--muted-foreground)]">
              Meaningful emotional and behavioural change requires time and consistent
              implementation.
              {nextDate ? (
                <>
                  {" "}
                  Your next reassessment will be available on <strong>{nextDate}</strong>.
                </>
              ) : null}
            </p>
          )}
          {lastDate ? (
            <p className="text-sm text-[var(--muted-foreground)]">Completed on {lastDate}.</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">
          {assessment.collectEmail ? (
            emailSent ? (
              <p className="text-sm">
                If a previous result exists for your details, we’ve emailed it to your
                registered address.
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
    return <EvaluatingCountdown redirectUrl={redirectUrl} seconds={assessment.vslCountdownSeconds} />;
  }

  if (step === "details") {
    const setDetail = (id: string, v: string) => setDetailAnswers((prev) => ({ ...prev, [id]: v }));
    return (
      <div className="flex flex-col gap-6">
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

  // step === "questions" — paginate the questions by the display mode.
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const leadContact = [lead.email, lead.mobile].filter(Boolean).join(" · ");

  type QGroup = { cat: (typeof assessment.categories)[number]; qs: (typeof assessment.categories)[number]["questions"] };
  // Categories are grouped by PAGE (1 = assessment, 2 = queries). Page 1's screens come
  // first, then page 2's — so the two scored pages are always visually separate.
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
  const idx = Math.min(screenIndex, lastIdx);
  const isLast = idx >= lastIdx;
  const current = screens[idx] ?? [];
  const currentRequiredLeft = current.flatMap((g) => g.qs).filter((q) => q.required && !answers[q.id]).length;

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
    setScreenIndex((i) => Math.min(i + 1, lastIdx));
  };
  const goBack = () => {
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    setError(null);
    setScreenIndex((i) => Math.max(i - 1, 0));
  };

  // Does the current screen carry an optional "actual number" field? If so we do
  // NOT auto-advance — the respondent may still want to type that number.
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
    if (assessment.questionDisplayMode === "ALL" || isLast || currentHasActualField) return;
    const requiredLeft = current
      .flatMap((g) => g.qs)
      .filter((q) => q.required && !next[q.id]).length;
    if (requiredLeft > 0) return;
    if (autoAdvanceRef.current) clearTimeout(autoAdvanceRef.current);
    setError(null);
    autoAdvanceRef.current = setTimeout(() => {
      setScreenIndex((i) => Math.min(i + 1, lastIdx));
    }, 250);
  };

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-xl font-semibold">{assessment.title}</h2>
        {screens.length > 1 ? (
          <span className="shrink-0 text-xs text-[var(--muted-foreground)]">
            Step {idx + 1} of {screens.length}
          </span>
        ) : null}
      </div>
      {leadName || leadContact ? (
        <div className="rounded-lg border bg-[var(--muted)] px-4 py-2 text-sm">
          {leadName ? <span className="font-medium">{leadName}</span> : null}
          {leadName && leadContact ? <span className="text-[var(--muted-foreground)]"> — </span> : null}
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
            <fieldset key={q.id} className="flex flex-col gap-2 rounded-lg border p-4">
              <legend className="px-1 text-sm font-medium">
                {q.text} {q.required ? <span className="text-red-500">*</span> : null}
              </legend>
              <div className="flex flex-col gap-2">
                {q.options.map((o) => (
                  <label key={o.id} className="flex items-center gap-3 text-sm">
                    <input
                      type="radio"
                      name={q.id}
                      checked={answers[q.id] === o.id}
                      onChange={() => selectAnswer(q.id, o.id)}
                    />
                    {o.label}
                  </label>
                ))}
              </div>
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
                      {actualField.prompt} Enter it below (optional) — otherwise we&apos;ll use the
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
        {idx > 0 ? (
          <Button size="lg" variant="outline" onClick={goBack} disabled={pending}>
            Back
          </Button>
        ) : (
          <span />
        )}
        {isLast ? (
          <Button size="lg" onClick={submitAnswers} disabled={pending} style={ctaStyle}>
            {pending
              ? "Submitting…"
              : assessment.pages.length === 0 && assessment.paidMode && assessment.paymentButtonLabel
                ? assessment.paymentButtonLabel // legacy: pay on submit when no result page
                : "Submit"}
          </Button>
        ) : (
          <Button size="lg" onClick={goNext} disabled={pending} style={ctaStyle}>
            Next
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
    <div className="flex min-h-[55vh] flex-col items-center justify-center gap-6 text-center">
      <div className="relative h-36 w-36">
        <div className="absolute inset-0 animate-spin rounded-full border-4 border-[var(--muted)] border-t-[var(--primary)]" />
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-5xl font-bold tabular-nums">{n > 0 ? n : "✓"}</span>
        </div>
      </div>
      <p className="text-lg font-medium">Analyzing your results…</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
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
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
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
      <select
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="flex h-10 w-full rounded-md border border-cyan-500 bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"
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
    </div>
  );
}

"use client";

import { useState, useEffect, useTransition } from "react";
import {
  startSubmission,
  completeSubmission,
  requestPreviousResults,
} from "@/features/assessment/actions/submission";
import { recordOptinView } from "@/features/assessment/actions/track";
import { type LeadInput, PROFESSION_OPTIONS } from "@/features/assessment/schemas";
import { pixelTrack, pixelTrackCustom } from "@/lib/pixel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface PublicOption { id: string; label: string; value: number }
export interface PublicQuestion {
  id: string;
  text: string;
  required: boolean;
  options: PublicOption[];
}
export interface PublicCategory {
  id: string;
  name: string;
  description: string | null;
  questions: PublicQuestion[];
}
export interface PublicAssessment {
  slug: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
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
  paidMode: boolean;
  paymentHeadline: string | null;
  paymentButtonLabel: string | null;
  categories: PublicCategory[];
}

type Step = "intro" | "questions" | "locked" | "evaluating";

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
  const [lead, setLead] = useState<LeadInput>({
    firstName: "",
    lastName: "",
    email: "",
    mobile: "",
    profession: "",
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<Lockout | null>(null);
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

  const questions = assessment.categories.flatMap((c) => c.questions);
  const requiredUnanswered = questions.filter(
    (q) => q.required && !answers[q.id],
  ).length;

  function submitLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await startSubmission(assessment.slug, lead, attribution, preview);
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
      setSubmissionId(res.data?.submissionId ?? null);
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
    if (!submissionId) {
      setError("Session expired. Please restart.");
      return;
    }
    if (requiredUnanswered > 0) {
      setError(`Please answer all required questions (${requiredUnanswered} left).`);
      return;
    }
    const payload = {
      answers: Object.entries(answers).map(([questionId, optionId]) => ({
        questionId,
        optionId,
      })),
    };
    // Switch to the countdown IMMEDIATELY (outside the transition) so it renders
    // from 10, while the server scores + generates the AI statement.
    setStep("evaluating");
    start(async () => {
      const res = await completeSubmission(submissionId, payload);
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
      // Paid mode: redirect to the payment page instead of the VSL/result (results
      // are already stored; after paying, the provider sends them to the VSL with
      // the token). No event=1 — the VSL-view pixel fires post-payment, not here.
      if (res.data?.paymentUrl) {
        await new Promise((r) => setTimeout(r, 1200));
        window.location.replace(res.data.paymentUrl);
        return;
      }
      // Keep the one spinner up while the pixel beacon flushes, then go — no
      // second countdown, no flicker. Append event=1 so the destination's VSL-view
      // pixel fires ONCE on this post-completion redirect; the link saved to the
      // CRM stays without it, so later email/WhatsApp opens don't re-fire.
      const base = res.data?.resultUrl ?? `/a/${assessment.slug}/r/${submissionId}`;
      const url = base + (base.includes("?") ? "&" : "?") + "event=1";
      await new Promise((r) => setTimeout(r, 1200));
      window.location.replace(url);
    });
  }

  if (step === "intro") {
    const retakeNotice =
      assessment.retakePolicy === "NEVER"
        ? "Please answer honestly — this assessment can be taken only once."
        : assessment.retakePolicy === "DELAYED"
          ? `Please answer honestly in one sitting. Once you submit, you won't be able to retake this assessment for ${assessment.retakeDays} day${assessment.retakeDays === 1 ? "" : "s"}.`
          : null;
    return (
      // Landing page + opt-in form on ONE screen (no separate "Start" step): the
      // headline/description show, with the lead form directly below.
      <form onSubmit={submitLead} className="flex flex-col gap-6">
        {assessment.coverImageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={assessment.coverImageUrl}
            alt=""
            className="aspect-video w-full rounded-lg object-cover"
          />
        ) : null}
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-bold tracking-tight">{assessment.title}</h1>
          {assessment.description ? (
            <p className="whitespace-pre-line text-[var(--muted-foreground)]">
              {assessment.description}
            </p>
          ) : null}
        </div>
        {retakeNotice ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[var(--foreground)]">
            {retakeNotice}
          </p>
        ) : null}

        <div className="flex flex-col gap-4">
          {assessment.collectFirstName ? (
            <Field
              label="First name"
              required={assessment.firstNameRequired}
              value={lead.firstName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, firstName: v }))}
            />
          ) : null}
          {assessment.collectLastName ? (
            <Field
              label="Last name"
              required={assessment.lastNameRequired}
              value={lead.lastName ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, lastName: v }))}
            />
          ) : null}
          {assessment.collectEmail ? (
            <Field
              label="Email"
              type="email"
              required={assessment.emailRequired}
              value={lead.email ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, email: v }))}
            />
          ) : null}
          {assessment.collectMobile ? (
            <Field
              label="Mobile"
              required={assessment.mobileRequired}
              value={lead.mobile ?? ""}
              onChange={(v) => setLead((l) => ({ ...l, mobile: v }))}
            />
          ) : null}
          {assessment.collectProfession ? (
            <SelectField
              label="Profession"
              required={assessment.professionRequired}
              value={lead.profession ?? ""}
              options={PROFESSION_OPTIONS}
              placeholder="Select your profession"
              onChange={(v) => setLead((l) => ({ ...l, profession: v }))}
            />
          ) : null}
        </div>

        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button size="lg" type="submit" disabled={pending}>
          {pending ? "Starting…" : "Start"}
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
    return <EvaluatingCountdown />;
  }

  // step === "questions"
  const leadName = [lead.firstName, lead.lastName].filter(Boolean).join(" ");
  const leadContact = [lead.email, lead.mobile].filter(Boolean).join(" · ");
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-xl font-semibold">{assessment.title}</h2>
      {leadName || leadContact ? (
        <div className="rounded-lg border bg-[var(--muted)] px-4 py-2 text-sm">
          {leadName ? <span className="font-medium">{leadName}</span> : null}
          {leadName && leadContact ? <span className="text-[var(--muted-foreground)]"> — </span> : null}
          {leadContact ? <span className="text-[var(--muted-foreground)]">{leadContact}</span> : null}
        </div>
      ) : null}
      {assessment.categories.map((c) => (
        <div key={c.id} className="flex flex-col gap-4">
          <div>
            <h3 className="font-semibold">{c.name}</h3>
            {c.description ? (
              <p className="text-sm text-[var(--muted-foreground)]">{c.description}</p>
            ) : null}
          </div>
          {c.questions.map((q) => (
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
                      onChange={() =>
                        setAnswers((a) => ({ ...a, [q.id]: o.id }))
                      }
                    />
                    {o.label}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </div>
      ))}
      {assessment.paidMode && assessment.paymentHeadline ? (
        <p className="whitespace-pre-line text-center text-lg font-semibold">
          {assessment.paymentHeadline}
        </p>
      ) : null}
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button size="lg" onClick={submitAnswers} disabled={pending}>
        {pending
          ? "Submitting…"
          : assessment.paidMode && assessment.paymentButtonLabel
            ? assessment.paymentButtonLabel
            : "Submit"}
      </Button>
    </div>
  );
}

/**
 * One big spinner shown from submit until the redirect, with the countdown number
 * centered INSIDE the ring. The number is a separate (non-rotating) layer so it
 * stays upright while the ring spins. Cosmetic: the redirect is driven by
 * completeSubmission resolving; past 0 it shows a check.
 */
function EvaluatingCountdown() {
  const [n, setN] = useState(10);
  useEffect(() => {
    if (n <= 0) return;
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);
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

"use client";

import { useState, useEffect, useTransition } from "react";
import {
  startSubmission,
  completeSubmission,
  requestPreviousResults,
} from "@/features/assessment/actions/submission";
import type { LeadInput } from "@/features/assessment/schemas";
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
  categories: PublicCategory[];
}

type Step = "intro" | "lead" | "questions" | "locked" | "evaluating" | "redirecting";

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
  });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<Lockout | null>(null);
  const [emailSent, setEmailSent] = useState(false);
  const [redirectUrl, setRedirectUrl] = useState<string | null>(null);
  const [pending, start] = useTransition();

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
      setRedirectUrl(res.data?.resultUrl ?? `/a/${assessment.slug}/r/${submissionId}`);
      setStep("redirecting");
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
      <div className="flex flex-col gap-6">
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
            <p className="text-[var(--muted-foreground)]">{assessment.description}</p>
          ) : null}
          {assessment.estimatedMinutes ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Estimated time: {assessment.estimatedMinutes} min
            </p>
          ) : null}
        </div>
        {retakeNotice ? (
          <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-[var(--foreground)]">
            {retakeNotice}
          </p>
        ) : null}
        <Button size="lg" onClick={() => setStep("lead")}>
          Start
        </Button>
      </div>
    );
  }

  if (step === "lead") {
    const anyLead =
      assessment.collectFirstName ||
      assessment.collectLastName ||
      assessment.collectEmail ||
      assessment.collectMobile;
    return (
      <form onSubmit={submitLead} className="flex flex-col gap-4">
        <h2 className="text-xl font-semibold">A few details</h2>
        {!anyLead ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            No details required — continue to the questions.
          </p>
        ) : null}
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
        {error ? <p className="text-sm text-red-500">{error}</p> : null}
        <Button type="submit" disabled={pending}>
          {pending ? "Starting…" : "Continue"}
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

  if (step === "redirecting" && redirectUrl) {
    return <CountdownRedirect url={redirectUrl} />;
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
      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      <Button size="lg" onClick={submitAnswers} disabled={pending}>
        {pending ? "Submitting…" : "Submit"}
      </Button>
    </div>
  );
}

/**
 * "Analyzing…" countdown from 10 shown WHILE the server scores + generates the AI
 * statement. It's cosmetic: the actual redirect is driven by completeSubmission
 * resolving (the statement is stored by then), so we stop and move on the moment
 * the response arrives — counting past 0 just shows "Almost ready…".
 */
function EvaluatingCountdown() {
  const [n, setN] = useState(10);
  useEffect(() => {
    if (n <= 0) return;
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n]);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]" />
      <p className="text-lg font-medium">Analyzing your results…</p>
      {n > 0 ? (
        <p className="text-4xl font-bold tabular-nums">{n}</p>
      ) : (
        <p className="text-sm text-[var(--muted-foreground)]">Almost ready…</p>
      )}
    </div>
  );
}

/**
 * Brief "results ready" pause (lets the browser pixel flush) then a hard redirect
 * to the destination URL. The AI statement is already generated + stored by now
 * (during the "Analyzing…" step), so this stays short.
 */
function CountdownRedirect({ url }: { url: string }) {
  const [n, setN] = useState(2);
  useEffect(() => {
    if (n <= 0) {
      window.location.replace(url);
      return;
    }
    const t = setTimeout(() => setN((x) => x - 1), 1000);
    return () => clearTimeout(t);
  }, [n, url]);

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-[var(--muted)] border-t-[var(--primary)]" />
      {n > 0 ? (
        <>
          <p className="text-lg font-medium">Evaluating your results…</p>
          <p className="text-4xl font-bold tabular-nums">{n}</p>
        </>
      ) : (
        <p className="text-lg font-medium">Your results are ready</p>
      )}
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

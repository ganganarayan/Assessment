"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  startSubmission,
  completeSubmission,
} from "@/features/assessment/actions/submission";
import type { LeadInput } from "@/features/assessment/schemas";
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

type Step = "intro" | "lead" | "questions";

export function AssessmentRunner({ assessment }: { assessment: PublicAssessment }) {
  const router = useRouter();
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
  const [pending, start] = useTransition();

  const questions = assessment.categories.flatMap((c) => c.questions);
  const requiredUnanswered = questions.filter(
    (q) => q.required && !answers[q.id],
  ).length;

  function submitLead(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await startSubmission(assessment.slug, lead);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSubmissionId(res.data?.submissionId ?? null);
      setStep("questions");
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
    start(async () => {
      const res = await completeSubmission(submissionId, payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/a/${assessment.slug}/r/${submissionId}`);
    });
  }

  if (step === "intro") {
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

  // step === "questions"
  return (
    <div className="flex flex-col gap-8">
      <h2 className="text-xl font-semibold">{assessment.title}</h2>
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

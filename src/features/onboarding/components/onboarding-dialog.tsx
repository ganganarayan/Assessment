"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { answerOnboardingStep, skipOnboardingStep, runOnboardingCheck, importStarterTemplate } from "@/features/onboarding/actions";
import { type OnboardingView, type OnboardingStepView } from "@/features/onboarding/data";

/**
 * THE SETUP SEQUENCE ON SCREEN: one question, and nothing else.
 *
 * It is a dialog rather than a page because a page is a place you can be lost on. There
 * is one field, one key to press, and the next question arrives in its place - so the
 * thing being asked is always the only thing on screen, and the number of decisions per
 * screen is one.
 *
 * WHAT THE SERVER DECIDES. Every answer returns the whole recomputed view and the next
 * question comes from that, never from a local index. So an answer that opens a branch
 * (saying yes to Meta) or closes one (saying no to payments) lands on the right screen,
 * and a workspace that already had a pixel saved is never asked for it.
 *
 * WHY IT CAN BE CLOSED. "Finish later" is on every step. A sequence that cannot be
 * escaped is a wall, and the one thing this must never do is stand between somebody and
 * the product they are evaluating. Nothing is lost: the position is recomputed on the
 * next load, so they come back to this exact question on any device.
 *
 * z-90, under the trial welcome dialog at z-100. The welcome is read first and this is
 * waiting behind it, which is the order those two were written in.
 */

export interface StarterTemplate {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  questions: number;
  gateQuestions: number;
}

export function OnboardingDialog({
  initial,
  templates,
  /** Shown straight away (the dashboard), or behind a button (the resume line). */
  openOnLoad = true,
}: {
  initial: OnboardingView;
  templates: StarterTemplate[];
  openOnLoad?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState(openOnLoad);
  const [cursor, setCursor] = useState<string | null>(initial.currentKey);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const step: OnboardingStepView | null = useMemo(
    () => view.steps.find((s) => s.key === cursor) ?? null,
    [view.steps, cursor],
  );
  const number = step ? view.steps.findIndex((s) => s.key === step.key) + 1 : 0;

  // The field starts on whatever is on record, so a step somebody comes back to shows
  // what they gave rather than an empty box they have to retype.
  useEffect(() => {
    setValue(step?.value ?? "");
    setError(null);
    setNote(null);
  }, [step?.key, step?.value]);

  // Nothing behind a dialog should scroll while it is up.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open, step?.key]);

  function adopt(next: OnboardingView) {
    setView(next);
    setCursor(next.currentKey);
  }

  async function submit(raw?: string) {
    if (!step || busy) return;
    const payload = (raw ?? value).trim();
    setBusy(true);
    setError(null);
    const r = await answerOnboardingStep(step.key, payload);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.data) adopt(r.data);
  }

  async function skip() {
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    const r = await skipOnboardingStep(step.key);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.data) adopt(r.data);
  }

  async function check() {
    if (!step || busy) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const r = await runOnboardingCheck(step.key);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (!r.data) return;
    if (r.data.pass) {
      setNote(r.data.message);
      adopt(r.data.view);
    } else {
      setError(r.data.message);
    }
  }

  async function importOne(templateId: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await importStarterTemplate(templateId);
    setBusy(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.data) router.push(`/w/assessments/${r.data.assessmentId}`);
  }

  function back() {
    if (!step) return;
    const i = view.steps.findIndex((s) => s.key === step.key);
    const previous = i > 0 ? view.steps[i - 1] : null;
    if (previous) setCursor(previous.key);
  }

  function close() {
    setOpen(false);
    // The dashboard's resume line and progress panel are both behind this.
    router.refresh();
  }

  if (!open) {
    return (
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        {view.complete ? "Review your setup" : `Resume setup (step ${view.currentNumber} of ${view.total})`}
      </Button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-question"
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
    >
      <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-xl border border-[var(--border)] bg-[var(--background)] p-5 shadow-2xl sm:max-w-lg sm:rounded-xl sm:p-6">
        {step ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
                Step {number} of {view.steps.length}
              </p>
              <button type="button" onClick={close} className="text-xs underline text-[var(--muted-foreground)]">
                Finish later
              </button>
            </div>

            {/* The bar is the only thing on screen that says this ends. */}
            <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-[var(--muted)]">
              <div
                className="h-full rounded-full bg-green-600 transition-all"
                style={{ width: `${Math.round((view.doneCount / Math.max(1, view.steps.length)) * 100)}%` }}
              />
            </div>

            <h2 id="onboarding-question" className="mt-4 text-xl font-bold tracking-tight">
              {step.question}
            </h2>
            {step.hint ? (
              <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">{step.hint}</p>
            ) : null}

            <div className="mt-4">
              {step.kind === "choice" ? (
                <div className="flex flex-col gap-2">
                  {(step.choices ?? []).map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      disabled={busy}
                      onClick={() => submit(c.value)}
                      className="rounded-lg border border-[var(--border)] p-3 text-left text-sm transition-colors hover:border-green-600 hover:bg-green-600/5 disabled:opacity-60"
                    >
                      <span className="font-medium">{c.label}</span>
                      {c.hint ? (
                        <span className="block text-[var(--muted-foreground)]">{c.hint}</span>
                      ) : null}
                    </button>
                  ))}
                </div>
              ) : step.kind === "check" ? (
                <Button onClick={check} disabled={busy}>
                  {busy ? "Checking..." : step.cta ?? "Check it"}
                </Button>
              ) : step.kind === "handoff" ? (
                <div className="flex flex-col gap-2">
                  {templates.length === 0 ? (
                    <p className="text-sm text-[var(--muted-foreground)]">
                      There are no templates on the shelf yet. You can start from a blank builder instead.
                    </p>
                  ) : (
                    templates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        disabled={busy}
                        onClick={() => importOne(t.id)}
                        className="rounded-lg border border-[var(--border)] p-3 text-left text-sm transition-colors hover:border-green-600 hover:bg-green-600/5 disabled:opacity-60"
                      >
                        <span className="font-medium">{t.title}</span>
                        <span className="block text-xs text-[var(--muted-foreground)]">
                          {t.category} · {t.gateQuestions} gate · {t.questions} scored
                        </span>
                        {t.summary ? <span className="mt-1 block text-[var(--muted-foreground)]">{t.summary}</span> : null}
                      </button>
                    ))
                  )}
                </div>
              ) : step.kind === "color" ? (
                <div className="flex items-center gap-3">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : "#16a34a"}
                    onChange={(e) => setValue(e.target.value)}
                    className="h-10 w-14 cursor-pointer rounded-md border bg-transparent"
                    aria-label="Pick your brand colour"
                  />
                  <Input
                    ref={inputRef}
                    value={value}
                    placeholder={step.placeholder}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                  />
                </div>
              ) : step.kind === "secret" ? (
                <PasswordInput
                  ref={inputRef}
                  value={value}
                  placeholder={step.placeholder}
                  autoComplete="off"
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
              ) : (
                <Input
                  ref={inputRef}
                  value={value}
                  placeholder={step.placeholder}
                  inputMode={step.kind === "phone" ? "tel" : undefined}
                  type={step.kind === "email" ? "email" : "text"}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void submit();
                  }}
                />
              )}
            </div>

            {error ? <p className="mt-3 text-sm text-amber-700">{error}</p> : null}
            {note ? <p className="mt-3 text-sm text-green-700">{note}</p> : null}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              {step.kind === "choice" || step.kind === "check" || step.kind === "handoff" ? null : (
                <Button onClick={() => submit()} disabled={busy}>
                  {busy ? "Saving..." : "Save and continue"}
                </Button>
              )}
              {number > 1 ? (
                <Button variant="ghost" size="sm" onClick={back} disabled={busy}>
                  Back
                </Button>
              ) : null}
              {step.skippable ? (
                <Button variant="ghost" size="sm" onClick={skip} disabled={busy}>
                  I will do this later
                </Button>
              ) : null}
            </div>
          </>
        ) : (
          <>
            <h2 className="text-xl font-bold tracking-tight">That is your setup done.</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted-foreground)]">
              {view.doneCount} of {view.total} answered
              {view.total - view.doneCount > 0
                ? `, and ${view.total - view.doneCount} left for later. You can finish those any time from your dashboard.`
                : ". Everything your funnel needs is connected."}
            </p>
            <Button className="mt-4 w-full" onClick={close}>
              Open my dashboard
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

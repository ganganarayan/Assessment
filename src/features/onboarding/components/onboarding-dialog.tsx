"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PasswordInput } from "@/components/ui/password-input";
import { WhatsAppConnect } from "@/features/whatsapp/components/whatsapp-connect";
import { FunnelLinks } from "@/features/assessment/components/funnel-links";
import { type WhatsAppConnectView } from "@/features/whatsapp/types";
import {
  answerOnboardingStep,
  skipOnboardingStep,
  runOnboardingCheck,
  importStarterTemplate,
} from "@/features/onboarding/actions";
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
 * (saying yes to Meta) or closes one (saying nobody pays yet) lands on the right screen,
 * and a workspace that already had a pixel saved is never asked for it.
 *
 * WHEN IT OPENS BY ITSELF. While somebody is working through the sequence - any answer
 * on record - or while the workspace has no funnel at all. Dismissing it remembers WHICH
 * step was dismissed, so it stays shut for that question and comes back when the position
 * moves, which is how importing a funnel leads on to testing it. An established workspace
 * that never started the sequence is never interrupted to confirm its own business name;
 * it gets the Resume line on the dashboard instead.
 *
 * WHY IT CAN ALWAYS BE CLOSED. "Finish later" is on every step. A sequence that cannot
 * be escaped is a wall, and the one thing this must never do is stand between somebody
 * and the product they are evaluating. Nothing is lost: the position is recomputed on
 * the next load, so they come back to this exact question on any device - including
 * after leaving the app entirely to sign up for a video host.
 *
 * z-90, under the trial welcome dialog at z-100. The welcome is read first and this is
 * waiting behind it, which is the order those two were written in.
 */

const DISMISSED_KEY = "a360.onboarding.dismissed.v1";

export interface StarterTemplate {
  id: string;
  title: string;
  category: string;
  summary: string | null;
  questions: number;
  gateQuestions: number;
  hasResultsPage: boolean;
  hasVslPage: boolean;
}

export function OnboardingDialog({
  initial,
  templates,
  whatsapp,
  /** /w/start: somebody asked for the sequence by name, so it is open on arrival. */
  alwaysOpen = false,
}: {
  initial: OnboardingView;
  templates: StarterTemplate[];
  whatsapp: WhatsAppConnectView | null;
  alwaysOpen?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(initial);
  const [open, setOpen] = useState(alwaysOpen);
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
  /** What they chose at the result-page question, so the import brings that one page. */
  const pageKind = view.steps.find((s) => s.key === "resultPageKind")?.value ?? null;

  // Should it show itself. Decided on the client because the answer depends on what was
  // dismissed in this browser, and a read that throws degrades to showing it: an extra
  // appearance is a nuisance, a missed one loses the step.
  useEffect(() => {
    if (alwaysOpen) {
      setOpen(true);
      return;
    }
    const key = view.currentKey;
    if (!key || view.complete) {
      setOpen(false);
      return;
    }
    let dismissed: string | null = null;
    try {
      dismissed = window.localStorage.getItem(DISMISSED_KEY);
    } catch {
      dismissed = null;
    }
    if (dismissed === key) {
      setOpen(false);
      return;
    }
    // Somebody in the middle of their setup, or a workspace that has not built
    // anything yet. An established workspace that never started the sequence is left
    // alone until it asks, through the Resume line on the dashboard.
    setOpen(view.started || !view.context.hasFunnel);
  }, [alwaysOpen, view.currentKey, view.complete, view.started, view.context.hasFunnel]);

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
    const r = await importStarterTemplate(templateId, pageKind ?? undefined);
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
    // Remembered against the step, not as a flag: the dialog comes back by itself when
    // the position moves on, which is what makes the publish popup work.
    try {
      if (view.currentKey) window.localStorage.setItem(DISMISSED_KEY, view.currentKey);
    } catch {
      // Not being able to remember it is not a reason to refuse to close it.
    }
    setOpen(false);
    router.refresh();
  }

  const previewUrl = view.context.previewSlug ? `/a/${view.context.previewSlug}?preview=1` : null;

  if (!open) return null;

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
                      {c.hint ? <span className="block text-[var(--muted-foreground)]">{c.hint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : step.kind === "check" ? (
                <Button onClick={check} disabled={busy}>
                  {busy ? "Checking..." : step.cta ?? "Check it"}
                </Button>
              ) : step.kind === "connect" ? (
                <div className="flex flex-col gap-3">
                  {whatsapp ? <WhatsAppConnect initial={whatsapp} /> : null}
                  <Button size="sm" variant="outline" onClick={() => submit("connected")} disabled={busy}>
                    Done, continue
                  </Button>
                </div>
              ) : step.kind === "info" ? (
                <InfoActions
                  step={step}
                  busy={busy}
                  previewUrl={previewUrl}
                  assessmentId={view.context.assessmentId}
                  onAcknowledge={() => void submit("ok")}
                  onOpenBuilder={(id) => {
                    close();
                    router.push(`/w/assessments/${id}`);
                  }}
                />
              ) : step.kind === "link" ? (
                /* The same block the builder shows on publish, so the two places a
                   person meets their own links do not describe them differently. */
                view.context.publishedSlug ? (
                  <FunnelLinks slug={view.context.publishedSlug} onDone={() => void submit("ok")} />
                ) : (
                  <p className="text-sm text-[var(--muted-foreground)]">
                    Publish your funnel and both links appear here.
                  </p>
                )
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
                          {pageKind === "VSL" && t.hasVslPage
                            ? " · with its VSL page"
                            : pageKind === "RESULTS" && t.hasResultsPage
                            ? " · with its results page"
                            : ""}
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
              {TYPED_KINDS.has(step.kind) ? (
                <Button onClick={() => submit()} disabled={busy}>
                  {busy ? "Saving..." : "Save and continue"}
                </Button>
              ) : null}
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
                : ". Your funnel is live and you know where to find everything."}
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

/** The kinds that are answered by typing into a field. */
const TYPED_KINDS = new Set(["text", "email", "url", "phone", "secret", "color"]);

/**
 * An info step's buttons.
 *
 * Three different jobs wear the same clothes here, and the difference is who finishes
 * the step: the PREVIEW opens the funnel in a new tab and is finished by actually
 * running one (the submission carries isPreview, and the sequence reads that), PUBLISH
 * opens the builder and is finished by the funnel going live, and the three orientation
 * steps are finished by being read.
 */
function InfoActions({
  step,
  busy,
  previewUrl,
  assessmentId,
  onAcknowledge,
  onOpenBuilder,
}: {
  step: OnboardingStepView;
  busy: boolean;
  previewUrl: string | null;
  assessmentId: string | null;
  onAcknowledge: () => void;
  onOpenBuilder: (id: string) => void;
}) {
  if (step.key === "previewTest") {
    return previewUrl ? (
      <a
        href={previewUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex h-10 items-center rounded-md bg-green-600 px-4 text-sm font-medium text-white hover:bg-green-700"
      >
        {step.cta ?? "Open the preview"}
      </a>
    ) : (
      <p className="text-sm text-[var(--muted-foreground)]">Import or build a funnel first and the preview opens from here.</p>
    );
  }

  if (step.key === "publishFunnel") {
    return assessmentId ? (
      <Button onClick={() => onOpenBuilder(assessmentId)} disabled={busy}>
        {step.cta ?? "Open the builder"}
      </Button>
    ) : (
      <p className="text-sm text-[var(--muted-foreground)]">Nothing to publish yet.</p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {step.link ? (
        <a
          href={step.link.href}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 items-center rounded-md border border-[var(--border)] px-3 text-sm hover:bg-[var(--muted)]"
        >
          {step.link.label}
        </a>
      ) : null}
      <Button size="sm" onClick={onAcknowledge} disabled={busy}>
        {step.cta ?? "Got it"}
      </Button>
    </div>
  );
}

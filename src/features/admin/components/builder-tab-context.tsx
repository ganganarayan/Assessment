"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Shares the Assessment Builder's active tab (Assessment | Results) between the
 * main sidebar (where the tabs now live, as a branch under "Assessment Builder")
 * and the editor page (which renders the panels). Kept in React state so both
 * panels stay mounted - switching tabs never remounts/loses unsaved edits.
 */
interface BuilderTabState {
  active: string;
  setActive: (key: string) => void;
}

const Ctx = createContext<BuilderTabState | null>(null);

export function BuilderTabProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("template");
  return <Ctx.Provider value={{ active, setActive }}>{children}</Ctx.Provider>;
}

export function useBuilderTab(): BuilderTabState | null {
  return useContext(Ctx);
}

/**
 * The builder's STEPS, shared by the sidebar branch and the editor panels.
 *
 * It was three tabs, and the first of them held everything: a 1,265-line settings form
 * plus the gate, the questions, both sets of bands and the destination connector, in one
 * column. The complaint that produced this split was "unending scrolling", from the
 * person who wrote the thing - so a customer meeting it for the first time had no chance.
 *
 * The order is the order a funnel is actually built in, not the order the fields happen
 * to sit in the file: who it is for, what you ask them, what you collect, how it scores,
 * what happens next. Someone who works top to bottom ends up with a finished funnel.
 *
 * `key` is persisted in nothing and shared through React state only, so renaming one
 * costs nothing but a rebuild.
 */
export const BUILDER_TABS = [
  { key: "template", label: "1. Start from a template" },
  { key: "basics", label: "2. Hero section" },
  { key: "audience", label: "3. Audience / profession" },
  { key: "gate", label: "4. Qualification gate" },
  { key: "exit", label: "5. Exit page (disqualified)" },
  { key: "questions", label: "6. How questions are shown" },
  { key: "categories", label: "7. Questions and categories" },
  { key: "optin", label: "8. Lead form" },
  { key: "scoring", label: "9. Scoring & bands" },
  { key: "after", label: "10. After results" },
  { key: "tracking", label: "11. Tracking & rules" },
  { key: "results", label: "12. Results page" },
  { key: "resultPage", label: "13. VSL result page" },
] as const;

/**
 * What each step IS, for the heading on it.
 *
 * Every step used to be titled "Settings - core details and lead capture", which was
 * true of the first one and a lie on the other six. A heading that does not change
 * when the page does is worse than no heading: it teaches you to stop reading it.
 */
export const STEP_HEADINGS: Record<string, { title: string; blurb: string }> = {
  template: {
    title: "Start from a template",
    blurb: "A working funnel to edit, instead of a blank page. Skip it if you would rather write your own.",
  },
  basics: { title: "Hero section", blurb: "The words on the first screen, plus the name and the link." },
  audience: { title: "Audience / profession", blurb: "An optional first question that sorts people before anything else. Off means Profession sits on the lead form instead." },
  gate: { title: "Qualification gate", blurb: "Screen people out before the assessment. Optional - skip it and everyone goes through." },
  exit: { title: "Exit page (disqualified)", blurb: "What someone the gate turns away actually sees. They never become a lead." },
  questions: { title: "How questions are shown", blurb: "How answering works, and how the scoring engine reads it." },
  categories: { title: "Questions and categories", blurb: "The questions themselves, grouped into the categories that get scored." },
  optin: { title: "Lead form", blurb: "What you ask for, and the words around the ask." },
  scoring: { title: "Scoring & bands", blurb: "What each score MEANS - overall and per category - and the AI write-up." },
  after: { title: "After results", blurb: "Where someone goes once they have their result." },
  tracking: { title: "Tracking & rules", blurb: "Meta events, colours, retakes - the settings nobody changes twice." },
};

/** The steps the Back / Save & next buttons walk through. The last two are separate
 *  builders with their own draft and Publish button, so the walk stops before them. */
export const STEP_KEYS = BUILDER_TABS.map((t) => t.key).filter(
  (k) => k !== "results" && k !== "resultPage",
) as readonly string[];

/** The step after `key`, or null at the end of the walk. */
export function nextStepKey(key: string): string | null {
  const i = STEP_KEYS.indexOf(key);
  return i >= 0 && i < STEP_KEYS.length - 1 ? (STEP_KEYS[i + 1] ?? null) : null;
}

/** The step before `key`, or null at the start. Back exists because a walk you can
 *  only go forward through is a trap: the moment you realise the last step was wrong,
 *  your only way back is the rail you were not looking at. */
export function prevStepKey(key: string): string | null {
  const i = STEP_KEYS.indexOf(key);
  return i > 0 ? (STEP_KEYS[i - 1] ?? null) : null;
}

/** The label for a step key, without its number - for a sentence on a button. */
export function stepLabel(key: string): string {
  const raw = BUILDER_TABS.find((t) => t.key === key)?.label ?? key;
  return raw.replace(/^\d+\.\s*/, "");
}

/**
 * Show its children only on the given step.
 *
 * Returns null rather than hiding with CSS, which is the opposite of what the old
 * BuilderTabPanels did - and deliberately. Those panels stayed mounted so an unsaved
 * edit survived a tab switch. That reasoning belongs to the big managers, which hold
 * their own drafts; a step of the SETTINGS form has nothing to lose, because every
 * field on every step lives in one state object that is posted whole on every save.
 * Not rendering seven eighths of a 1,265-line form is most of the speed-up.
 */
export function BuilderStep({ step, children }: { step: string; children: ReactNode }) {
  const ctx = useBuilderTab();
  const active = ctx?.active ?? "template";
  if (active !== step) return null;
  return <>{children}</>;
}

/**
 * Start every assessment at step 1.
 *
 * The active step lives in the layout's provider, so it survives navigation - which is
 * right while you are working on one assessment and wrong the moment you open another:
 * you would land on "Tracking & rules" of a funnel you have not named yet. Keyed on the
 * assessment id, so it resets when you switch and never while you are working.
 */
export function BuilderStepReset({ assessmentId }: { assessmentId: string }) {
  const ctx = useBuilderTab();
  const setActive = ctx?.setActive;
  useEffect(() => {
    setActive?.("template");
  }, [assessmentId, setActive]);
  return null;
}

/**
 * Back / Next for the steps whose content is a manager rather than form fields.
 *
 * Those managers save themselves as you go - each row, each band, each question has
 * its own action - so there is nothing here to press Save on, and a Save button that
 * saved nothing would be the most misleading control on the page. This navigates and
 * says so.
 *
 * It renders BELOW the manager, because a Back/Next row above the thing you came to
 * edit is a row you press by accident.
 */
export function BuilderStepNav({ step }: { step: string }) {
  const ctx = useBuilderTab();
  const prev = prevStepKey(step);
  const next = nextStepKey(step);
  const go = (k: string | null) => {
    if (!k) return;
    ctx?.setActive(k);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-t pt-4">
      {prev ? (
        <button
          type="button"
          onClick={() => go(prev)}
          className="rounded-md border px-4 py-2 text-sm font-medium hover:bg-[var(--muted)]"
        >
          ← Back
        </button>
      ) : null}
      {next ? (
        <button
          type="button"
          onClick={() => go(next)}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Next: {stepLabel(next)} →
        </button>
      ) : null}
      <span className="text-xs text-[var(--muted-foreground)]">
        Changes on this step save as you make them.
      </span>
    </div>
  );
}

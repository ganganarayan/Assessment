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
  const [active, setActive] = useState("basics");
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
  { key: "basics", label: "1. Basics" },
  { key: "audience", label: "2. Who it's for" },
  { key: "questions", label: "3. Questions" },
  { key: "optin", label: "4. Opt-in form" },
  { key: "scoring", label: "5. Scoring & bands" },
  { key: "after", label: "6. After results" },
  { key: "tracking", label: "7. Tracking & rules" },
  { key: "results", label: "Results page" },
  { key: "resultPage", label: "VSL Result Page" },
] as const;

/** The steps the "Save & next" button walks through. The last two are separate
 *  builders with their own publish buttons, so the walk stops before them. */
export const STEP_KEYS = BUILDER_TABS.map((t) => t.key).filter(
  (k) => k !== "results" && k !== "resultPage",
) as readonly string[];

/** The step after `key`, or null at the end of the walk. */
export function nextStepKey(key: string): string | null {
  const i = STEP_KEYS.indexOf(key);
  return i >= 0 && i < STEP_KEYS.length - 1 ? (STEP_KEYS[i + 1] ?? null) : null;
}

/** The label for a step key, for the "Save & next: <label>" button. */
export function stepLabel(key: string): string {
  return BUILDER_TABS.find((t) => t.key === key)?.label ?? key;
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
  const active = ctx?.active ?? "basics";
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
    setActive?.("basics");
  }, [assessmentId, setActive]);
  return null;
}

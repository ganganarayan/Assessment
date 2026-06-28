"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

/**
 * Shares the Assessment Builder's active tab (Assessment | Results) between the
 * main sidebar (where the tabs now live, as a branch under "Assessment Builder")
 * and the editor page (which renders the panels). Kept in React state so both
 * panels stay mounted — switching tabs never remounts/loses unsaved edits.
 */
interface BuilderTabState {
  active: string;
  setActive: (key: string) => void;
}

const Ctx = createContext<BuilderTabState | null>(null);

export function BuilderTabProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState("assessment");
  return <Ctx.Provider value={{ active, setActive }}>{children}</Ctx.Provider>;
}

export function useBuilderTab(): BuilderTabState | null {
  return useContext(Ctx);
}

/** The fixed builder tabs, shared by the sidebar branch + the editor panels. */
export const BUILDER_TABS = [
  { key: "assessment", label: "Assessment" },
  { key: "results", label: "Results" },
] as const;

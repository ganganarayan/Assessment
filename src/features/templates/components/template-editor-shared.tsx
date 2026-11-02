"use client";

import { type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/**
 * The small pieces the three template editors share.
 *
 * WHY THESE EDITORS EXIST AT ALL, since the question is reasonable: the live assessment
 * builder's managers each save ONE DATABASE ROW at a time - `updateQuestion(id, ...)`,
 * `deleteCategory(id)`. A template has no rows. It is a single JSON document, and every
 * part of it is saved together or not at all. That is not a detail that can be papered
 * over: a row id is the first argument of every call those managers make.
 *
 * So the questions, the bands and the gate get editors that work on the document in
 * memory and hand the whole thing back. The settings steps are the REAL form, reused
 * unchanged (see AssessmentForm's `templateMode`), because those are plain fields and
 * copying 1,700 lines of them would guarantee the two drifted apart.
 */

/** Move an item inside an array, immutably. Out-of-range is a no-op, not a throw:
 *  Up on the first row is a button somebody will press. */
export function move<T>(arr: readonly T[], from: number, to: number): T[] {
  if (to < 0 || to >= arr.length || from === to) return [...arr];
  const copy = [...arr];
  const [item] = copy.splice(from, 1);
  copy.splice(to, 0, item as T);
  return copy;
}

/** Replace one item by index, immutably. */
export function replaceAt<T>(arr: readonly T[], index: number, next: T): T[] {
  return arr.map((v, i) => (i === index ? next : v));
}

/** Drop one item by index, immutably. */
export function removeAt<T>(arr: readonly T[], index: number): T[] {
  return arr.filter((_, i) => i !== index);
}

/** Renumber `displayOrder` to match array position. The transfer shape stores the order
 *  as a number on each row, so moving a row without this looks right until it is saved
 *  and read back in the order it was before. */
export function renumber<T extends { displayOrder: number }>(arr: readonly T[]): T[] {
  return arr.map((v, i) => ({ ...v, displayOrder: i }));
}

/** Up / Down / Remove for one row. One component so the three editors cannot end up
 *  with three slightly different versions of the most-pressed control on the screen. */
export function RowControls({
  index,
  count,
  onMove,
  onRemove,
  removeLabel = "Remove",
  disabled = false,
}: {
  index: number;
  count: number;
  onMove: (from: number, to: number) => void;
  onRemove: () => void;
  removeLabel?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || index === 0}
        onClick={() => onMove(index, index - 1)}
        aria-label="Move up"
      >
        ↑
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled || index === count - 1}
        onClick={() => onMove(index, index + 1)}
        aria-label="Move down"
      >
        ↓
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled={disabled}
        onClick={onRemove}
        className="text-red-600 hover:text-red-700"
      >
        {removeLabel}
      </Button>
    </div>
  );
}

/** A labelled field. Mobile first: the label sits above the control at every width. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-[var(--muted-foreground)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--muted-foreground)]">{hint}</span> : null}
    </div>
  );
}

/** The one select style used across these editors. */
export const SELECT_CLASS =
  "h-10 w-full rounded-md border border-[var(--input)] bg-[var(--background)] px-3 text-sm";

/** A stable key for a new row, used only inside the document (never a database id). */
export function newKey(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

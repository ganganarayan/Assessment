"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Autosave on leaving a field, for any form in the app.
 *
 * THE PROBLEM IT SOLVES. The editors here are long. The Save button is at the bottom,
 * so a change made near the top is a scroll away from being kept, and often enough is
 * simply lost, which is the worst possible outcome for a form someone has just spent
 * two minutes on. Leaving a field is the moment the person has finished with it,
 * whether they got there by Tab or by clicking elsewhere, so that is when it is written.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *   - It does not save on every keystroke. That is a request per character and a server
 *     action per character, for no gain over saving when they move on.
 *   - It does not replace the Save button. Autosave is a safety net, not a change of
 *     model: the button stays, says what it always said, and remains the thing someone
 *     presses when they want to be certain.
 *   - It does not refresh the route. The explicit Save can, because the page around it
 *     may need to catch up. Doing that on every blur would re-render the form under the
 *     cursor, which is worse than the problem being solved.
 *
 * FOUR RULES that keep it from becoming a nuisance:
 *   1. `enabled` is false wherever a save would CREATE something. Blurring a field on a
 *      new-record form must never bring a row into existence.
 *   2. It fires only when the payload actually changed, so tabbing through a form writes
 *      nothing and shows nothing.
 *   3. One save in flight at a time, with at most one queued behind it, so a fast typist
 *      cannot stack requests or land them out of order.
 *   4. Clicking the Save button blurs a field first; that blur is ignored, so the two
 *      never both fire for one action.
 */

interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface Autosave<E extends HTMLElement = HTMLElement> {
  /**
   * Spread onto the <form>, or onto any wrapping <div> for the many editors here that
   * are not form elements at all. Needs `className="relative"` so the flash can be
   * placed against it.
   */
  bind: {
    ref: React.RefObject<E | null>;
    onBlur: React.FocusEventHandler<HTMLElement>;
  };
  /** Render inside the wrapper, before the fields. */
  flash: React.ReactNode;
  /** Call after an EXPLICIT save so autosave knows the baseline moved. */
  markSaved: (payload: unknown) => void;
}

export function useAutosave<E extends HTMLElement = HTMLElement>(opts: {
  /** False on create-mode forms, or wherever autosave must not run. */
  enabled: boolean;
  /** The exact payload an explicit save would send. */
  build: () => unknown;
  save: (payload: never) => Promise<SaveResult>;
}): Autosave<E> {
  const { enabled, build, save } = opts;
  const formRef = useRef<E | null>(null);
  const savedRef = useRef<string | null>(null);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const [flash, setFlash] = useState<{ top: number; left: number; beside: boolean; text: string; ok: boolean } | null>(
    null,
  );

  useEffect(() => () => window.clearTimeout(timer.current), []);

  /** Put the confirmation directly under the field just left, in the form's own
   *  coordinate space so it travels with the page rather than floating over it. */
  const showFlash = useCallback((anchor: HTMLElement, text: string, ok: boolean) => {
    const host = formRef.current;
    if (!host) return;
    const a = anchor.getBoundingClientRect();
    const h = host.getBoundingClientRect();
    // Beside the control, in the left margin - NOT underneath it.
    //
    // Underneath is where the help text lives, so the badge landed on top of the
    // sentence explaining the very setting that had just been saved, and the two
    // together read as neither. The margin is empty, which is what makes it the right
    // place for something that appears for two seconds.
    //
    // Unless the margin is too narrow to hold it, which happens on a phone and in any
    // deeply indented block - then it goes back under the control, where at worst it
    // overlaps text rather than being cut off by the edge of the screen.
    const gutter = a.left - h.left;
    const roomForBadge = gutter >= 96;
    setFlash({
      top: roomForBadge ? a.top - h.top - 2 : a.bottom - h.top + 4,
      left: roomForBadge ? gutter - 10 : gutter,
      beside: roomForBadge,
      text,
      ok,
    });
    window.clearTimeout(timer.current);
    // A success is a glance. An error has to stay long enough to read and act on.
    timer.current = window.setTimeout(() => setFlash(null), ok ? 2500 : 6000);
  }, []);

  const run = useCallback(
    async (payload: unknown, body: string, anchor: HTMLElement) => {
      savingRef.current = true;
      try {
        const res = await save(payload as never);
        if (!res.ok) {
          showFlash(anchor, res.error || "Not saved", false);
          return;
        }
        savedRef.current = body;
        showFlash(anchor, "Saved", true);
      } catch {
        showFlash(anchor, "Not saved, check your connection", false);
      } finally {
        savingRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          const again = build();
          const againBody = JSON.stringify(again);
          if (againBody !== savedRef.current) void run(again, againBody, anchor);
        }
      }
    },
    [build, save, showFlash],
  );

  const onBlur = useCallback<React.FocusEventHandler<HTMLElement>>(
    (e) => {
      if (!enabled) return;
      const el = e.target;
      const isField =
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement;
      if (!isField) return;
      if (el instanceof HTMLInputElement && (el.type === "submit" || el.type === "button")) return;
      // Clicking Save blurs the field first. Let the submit do the work and say so once.
      const next = e.relatedTarget as HTMLElement | null;
      if (next instanceof HTMLButtonElement && next.type === "submit") return;

      const payload = build();
      const body = JSON.stringify(payload);
      if (body === savedRef.current) return;

      if (savingRef.current) {
        queuedRef.current = true;
        return;
      }
      void run(payload, body, el);
    },
    [enabled, build, run],
  );

  const markSaved = useCallback((payload: unknown) => {
    savedRef.current = JSON.stringify(payload);
  }, []);

  return {
    bind: { ref: formRef, onBlur },
    flash: flash ? (
      <span
        aria-live="polite"
        className={`pointer-events-none absolute z-20 flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium shadow-sm ${
          flash.ok
            ? "border-green-700 bg-green-600 text-white"
            : "border-red-600 bg-red-500 text-white"
        }`}
        style={{ top: flash.top, left: flash.left, transform: flash.beside ? "translateX(-100%)" : undefined }}
      >
        {flash.ok ? "✓" : "!"} {flash.text}
      </span>
    ) : null,
    markSaved,
  };
}

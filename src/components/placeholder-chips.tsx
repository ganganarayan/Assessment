"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";

/**
 * The placeholder vocabulary, as buttons that type for you.
 *
 * 🔴 WHY IT IS NOT JUST A LIST. It used to be a sentence of {{tokens}} above the form,
 * which asks the owner to select a token out of running prose, copy it, find their
 * place again and paste. Everybody who got one character wrong got a message with a
 * literal {{firstname}} in it and no error anywhere to say so, because a placeholder
 * that does not match a field is left exactly as typed. A click cannot misspell.
 *
 * HOW IT KNOWS WHERE TO TYPE. Fields opt in with data-ph="1". The container listens for
 * focusin, remembers the last such field, and the chip inserts at that field's cursor.
 * Nothing is wired per field, so a form can grow a new box without touching this.
 */

type Field = HTMLInputElement | HTMLTextAreaElement;

function isInsertable(el: EventTarget | null): el is Field {
  return (
    (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) &&
    el.dataset.ph === "1"
  );
}

/**
 * Write into a React-controlled field.
 *
 * 🔴 el.value = x DOES NOT WORK on a controlled input. React tracks the last value it
 * rendered and swallows the change event when the two already agree, so the keystroke
 * is lost and the box snaps back on the next render. Going through the prototype's own
 * setter and dispatching a bubbling input event is what makes React see a real edit.
 */
function setControlledValue(el: Field, next: string): void {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) setter.call(el, next);
  else el.value = next;
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

export function PlaceholderChips({
  placeholders,
  note,
  children,
}: {
  /** Bare names, without the braces. */
  placeholders: readonly string[];
  /** The one or two worth explaining, under the chips. */
  note?: ReactNode;
  /** The form these chips type into. Fields opt in with data-ph="1". */
  children: ReactNode;
}) {
  const scope = useRef<HTMLDivElement | null>(null);
  const last = useRef<Field | null>(null);
  // Where the cursor was when the field lost focus to the chip. Read at click time,
  // because clicking a button blurs the field and some browsers then report 0.
  const caret = useRef<{ start: number; end: number }>({ start: 0, end: 0 });

  useEffect(() => {
    const node = scope.current;
    if (!node) return;
    const remember = (e: Event) => {
      if (isInsertable(e.target)) {
        last.current = e.target;
        caret.current = {
          start: e.target.selectionStart ?? e.target.value.length,
          end: e.target.selectionEnd ?? e.target.value.length,
        };
      }
    };
    // Capture the caret on every move inside the field, not only on focus, so a click
    // into the middle of a half-written sentence inserts there rather than at the end.
    const track = (e: Event) => {
      if (isInsertable(e.target)) {
        caret.current = {
          start: e.target.selectionStart ?? 0,
          end: e.target.selectionEnd ?? 0,
        };
      }
    };
    node.addEventListener("focusin", remember);
    node.addEventListener("keyup", track);
    node.addEventListener("mouseup", track);
    node.addEventListener("input", track);
    return () => {
      node.removeEventListener("focusin", remember);
      node.removeEventListener("keyup", track);
      node.removeEventListener("mouseup", track);
      node.removeEventListener("input", track);
    };
  }, []);

  const insert = useCallback((name: string) => {
    const el = last.current;
    const token = `{{${name}}}`;
    if (!el || !el.isConnected) return;
    const { start, end } = caret.current;
    const value = el.value;
    const next = value.slice(0, start) + token + value.slice(end);
    setControlledValue(el, next);
    const at = start + token.length;
    caret.current = { start: at, end: at };
    // After the value change, not before: setting a caret on the old string puts it in
    // the wrong place the moment the token is longer than what it replaced.
    requestAnimationFrame(() => {
      el.focus();
      try {
        el.setSelectionRange(at, at);
      } catch {
        // Some input types refuse a selection range. The text is in either way.
      }
    });
  }, []);

  return (
    <div ref={scope} className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-md bg-[var(--muted)]/40 px-3 py-2">
        <div className="flex flex-wrap items-center gap-1">
          <span className="mr-1 text-xs text-[var(--muted-foreground)]">Insert:</span>
          {placeholders.map((p) => (
            <button
              key={p}
              type="button"
              // onMouseDown, not onClick: mousedown fires before the field blurs, and
              // preventing its default keeps the caret where the owner left it.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insert(p)}
              className="rounded border border-[var(--field-border)] bg-[var(--background)] px-2 py-0.5 font-mono text-[11px] text-[var(--foreground)] hover:bg-[var(--muted)]"
            >
              {p}
            </button>
          ))}
        </div>
        {note ? <p className="text-xs text-[var(--muted-foreground)]">{note}</p> : null}
      </div>
      {children}
    </div>
  );
}

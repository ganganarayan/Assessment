"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { updatePlatformOnboardingSteps } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * The getting-started steps every tenant reads on their dashboard.
 *
 * Autosaves like the assessment builder, because this is a list people edit by adding a
 * row, retyping it, and reordering their thinking - a form that only saves on a button
 * loses that work the moment they navigate away mid-thought.
 *
 * The Save button stays anyway. Autosave is silent by nature, and on the one screen that
 * decides what every customer reads first, "did that save?" is a question worth being
 * able to answer by pressing something.
 *
 * Debounced rather than per keystroke: a step is a sentence, and writing a sentence
 * should not be twenty writes.
 */
const AUTOSAVE_MS = 1200;

export function OnboardingStepsForm({ initial }: { initial: string[] }) {
  const [steps, setSteps] = useState<string[]>(initial.length ? initial : [""]);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Skips the save that would otherwise fire for the value we just loaded.
  const loadedRef = useRef(true);

  function save(next: string[], announce: string) {
    setError(null);
    startTransition(async () => {
      const r = await updatePlatformOnboardingSteps(next);
      if (r.ok) setMsg(announce);
      else setError(r.error ?? "Could not save.");
    });
  }

  useEffect(() => {
    if (loadedRef.current) {
      loadedRef.current = false;
      return;
    }
    const t = setTimeout(() => save(steps, "Saved"), AUTOSAVE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [steps]);

  function setAt(i: number, value: string) {
    setMsg(null);
    setSteps((prev) => prev.map((s, idx) => (idx === i ? value : s)));
  }

  function addStep() {
    setMsg(null);
    setSteps((prev) => [...prev, ""]);
  }

  function removeStep(i: number) {
    setMsg(null);
    setSteps((prev) => (prev.length === 1 ? [""] : prev.filter((_, idx) => idx !== i)));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {steps.map((step, i) => (
          <div key={i} className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-xs font-semibold text-white"
            >
              {i + 1}
            </span>
            <Input
              value={step}
              onChange={(e) => setAt(i, e.target.value)}
              placeholder={i === 0 ? "e.g. Settings → add your Meta pixel and Conversions API token" : "Next step"}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-8 shrink-0 px-2 text-xs"
              onClick={() => removeStep(i)}
              aria-label={`Remove step ${i + 1}`}
            >
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button size="sm" variant="outline" onClick={addStep}>
          Add step
        </Button>
        <Button size="sm" onClick={() => save(steps, "Saved")} disabled={pending}>
          {pending ? "Saving…" : "Save steps"}
        </Button>
        {msg ? <span className="text-xs text-green-600">{msg}</span> : null}
        {error ? <span className="text-xs text-red-500">{error}</span> : null}
        <span className="text-xs text-[var(--muted-foreground)]">
          Saves as you type. Blank rows are dropped; clear them all to hide the panel.
        </span>
      </div>
    </div>
  );
}

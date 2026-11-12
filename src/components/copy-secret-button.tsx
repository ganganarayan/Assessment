"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { copyStoredSecret } from "@/features/secrets/actions";
import { type SecretName } from "@/features/secrets/names";

/**
 * "Copy" beside a saved secret. Asks the server for the one named secret on click and
 * writes it straight to the clipboard: the value is never kept in state, rendered,
 * or put in an attribute, so the page still never shows it.
 *
 * Render it only where a value is saved (the field already says "(saved)").
 */
export function CopySecretButton({ name, recordId, className }: { name: SecretName; recordId?: string; className?: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  const [error, setError] = useState<string | null>(null);

  const onClick = async () => {
    setError(null);
    setState("busy");
    const pending = copyStoredSecret(name, recordId);
    let failure: string | null = null;
    try {
      // Safari only lets a clipboard write follow a click if the write starts inside
      // the click, so hand it a promise of the text rather than awaiting first.
      if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
        const blob = pending.then((r) => {
          if (!r.ok) {
            failure = r.error;
            throw new Error(r.error);
          }
          return new Blob([r.value], { type: "text/plain" });
        });
        await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
      } else {
        throw new Error("no ClipboardItem");
      }
    } catch {
      if (!failure) {
        const r = await pending;
        if (!r.ok) failure = r.error;
        else {
          try {
            await navigator.clipboard.writeText(r.value);
          } catch {
            failure = "The browser blocked the clipboard. Click Copy again.";
          }
        }
      }
    }
    if (failure) {
      setError(failure);
      setState("idle");
      return;
    }
    setState("copied");
    setTimeout(() => setState("idle"), 2000);
  };

  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={state === "busy"}>
        {state === "copied" ? "Copied" : state === "busy" ? "Copying..." : "Copy"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

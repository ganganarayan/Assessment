"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { copyStoredSecret, regenerateWebhookSecret } from "@/features/secrets/actions";
import { type SecretName, type SecretResult, type WebhookAccount } from "@/features/secrets/names";

/**
 * Put a server-held secret on the clipboard. Returns an error message, or null when it
 * was copied. The value is never kept in state, rendered, or put in an attribute.
 *
 * Safari only lets a clipboard write follow a click if the write starts inside the
 * click, so the clipboard is handed a PROMISE of the text rather than awaited first.
 */
async function secretToClipboard(pending: Promise<SecretResult>): Promise<string | null> {
  let failure: string | null = null;
  try {
    if (typeof ClipboardItem === "undefined" || !navigator.clipboard?.write) throw new Error("no ClipboardItem");
    const blob = pending.then((r) => {
      if (!r.ok) {
        failure = r.error;
        throw new Error(r.error);
      }
      return new Blob([r.value], { type: "text/plain" });
    });
    await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
    return null;
  } catch {
    if (failure) return failure;
    const r = await pending;
    if (!r.ok) return r.error;
    try {
      await navigator.clipboard.writeText(r.value);
      return null;
    } catch {
      return "The browser blocked the clipboard. Click Copy to try again.";
    }
  }
}

type ButtonState = "idle" | "busy" | "done";

function useSecretButton() {
  const [state, setState] = useState<ButtonState>("idle");
  const [error, setError] = useState<string | null>(null);
  const run = async (pending: () => Promise<SecretResult>, after?: () => void) => {
    setError(null);
    setState("busy");
    const failure = await secretToClipboard(pending());
    after?.();
    if (failure) {
      setError(failure);
      setState("idle");
      return;
    }
    setState("done");
    setTimeout(() => setState("idle"), 2000);
  };
  return { state, error, run };
}

/**
 * "Copy" beside a saved secret. Render it only where a value is saved (the field
 * already says "(saved)").
 */
export function CopySecretButton({ name, recordId, className }: { name: SecretName; recordId?: string; className?: string }) {
  const { state, error, run } = useSecretButton();
  return (
    <span className={`inline-flex items-center gap-2 ${className ?? ""}`}>
      <Button type="button" variant="outline" size="sm" onClick={() => run(() => copyStoredSecret(name, recordId))} disabled={state === "busy"}>
        {state === "done" ? "Copied" : state === "busy" ? "Copying..." : "Copy"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

/**
 * "Generate new" beside a Razorpay webhook secret: makes a fresh secret, saves it over
 * the old one and copies it, in one click. Asks first when one is already saved,
 * because Razorpay's webhooks fail until the new value is pasted into Razorpay.
 */
export function GenerateWebhookSecretButton({ account, hasExisting }: { account: WebhookAccount; hasExisting: boolean }) {
  const router = useRouter();
  const { state, error, run } = useSecretButton();
  const onClick = () => {
    if (
      hasExisting &&
      !window.confirm(
        "Replace the saved webhook secret with a new one?\n\nThe old one stops working now. Paste the new one (it will be on your clipboard) into Razorpay → Settings → Webhooks straight away, or payments from Razorpay will not be recorded.",
      )
    ) {
      return;
    }
    void run(() => regenerateWebhookSecret(account), () => router.refresh());
  };
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={state === "busy"}>
        {state === "done" ? "New secret copied" : state === "busy" ? "Generating..." : "Generate new"}
      </Button>
      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </span>
  );
}

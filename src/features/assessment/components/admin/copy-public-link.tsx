"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Copies an assessment's PUBLIC link (never the builder/preview link).
 *
 * `base` is resolved server-side from the assessment's tenant:
 *   - a custom/parent host string when the tenant has one, or
 *   - null for a platform assessment, in which case we use the browser's own
 *     origin — the exact host the operator is on, matching "copy from the address
 *     bar". So the copied link is the one that actually serves the page.
 */
export function CopyPublicLink({ slug, base }: { slug: string; base: string | null }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const origin = base ?? (typeof window !== "undefined" ? window.location.origin : "");
    const url = `${origin}/a/${slug}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard API blocked (insecure context / permissions): fall back to a
      // hidden textarea + execCommand so the button still works.
      const ta = document.createElement("textarea");
      ta.value = url;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* give up silently — nothing more we can do */
      }
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={onCopy}
      className={buttonVariants({ variant: "outline", size: "sm" })}
      aria-live="polite"
      title="Copy the public link to share"
    >
      {copied ? "Copied ✓" : "Copy link"}
    </button>
  );
}

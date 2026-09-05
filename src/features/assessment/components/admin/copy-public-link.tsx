"use client";

import { useState } from "react";
import { buttonVariants } from "@/components/ui/button";

/**
 * Copies an assessment's PUBLIC link — the plain public page on the SAME host the
 * operator is browsing (i.e. exactly what "View public page" opens, with no
 * ?preview or other query). No custom-domain / subdomain manufacturing: whatever
 * origin you're on is the origin that serves the page, so that's the link to share.
 */
export function CopyPublicLink({ slug }: { slug: string }) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
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

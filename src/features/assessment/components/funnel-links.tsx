"use client";

import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * THE TWO LINKS A LIVE FUNNEL HAS, side by side, with one way to take each of them.
 *
 * Both are offered together because they answer two different questions at the same
 * moment: "is this right" and "what goes in the ad". Offering only the public link is
 * how a funnel reaches an audience before its owner has walked it once.
 *
 * Each row has a Copy button and an arrow to the top right, which is the convention for
 * "this opens somewhere else" - so the link can be taken without leaving the dialog, or
 * followed without copying it.
 *
 * Copying opens the confirmation box: it is the only feedback that a clipboard write
 * actually happened, and on the publish dialog it is also the way out, since the next
 * thing to do is paste it somewhere this app cannot see.
 *
 * 🟡 ABSOLUTE URLS ARE BUILT FROM THE ORIGIN BEING BROWSED, never manufactured from a
 * tenant's domain list: whatever host is serving this screen is the host that serves the
 * funnel, which is what makes these links correct on a custom domain as well as on the
 * platform's own.
 */
export function FunnelLinks({
  slug,
  /** Called when the confirmation box is closed with OK: the dialog around this closes. */
  onDone,
}: {
  slug: string;
  onDone?: () => void;
}) {
  const [copied, setCopied] = useState<"preview" | "public" | null>(null);

  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const publicUrl = `${origin}/a/${slug}`;
  const previewUrl = `${origin}/a/${slug}?preview=1`;

  async function copy(which: "preview" | "public", url: string) {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Clipboard blocked (insecure context, permissions): fall back to a hidden
      // textarea so the button still works. The link is on screen either way.
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
        /* nothing more we can do */
      }
      ta.remove();
    }
    setCopied(which);
  }

  return (
    <div className="flex flex-col gap-3">
      <LinkRow
        label="Your preview link"
        note="Test it yourself. A preview does not count against your plan's responses and fires no Meta events, so run it as often as you like."
        url={previewUrl}
        onCopy={() => void copy("preview", previewUrl)}
      />
      <LinkRow
        label="Your public link"
        note="This is the one that goes in the ad. Send traffic straight to it rather than to a page in front of it."
        url={publicUrl}
        onCopy={() => void copy("public", publicUrl)}
      />

      {copied ? (
        <div className="rounded-lg border border-green-600/40 bg-green-600/5 p-3 text-sm">
          <p className="font-medium">
            {copied === "preview" ? "Preview link copied." : "Public link copied."}
          </p>
          <p className="mt-1 text-[var(--muted-foreground)]">
            {copied === "preview"
              ? "Open it in a new tab and walk the whole funnel once, end to end."
              : "Paste it into your ad. Optimise the ad on GatePassed, which fires the moment somebody clears your gate."}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button size="sm" onClick={() => onDone?.()}>
              OK
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setCopied(null)}>
              Keep this open
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LinkRow({
  label,
  note,
  url,
  onCopy,
}: {
  label: string;
  note: string;
  url: string;
  onCopy: () => void;
}) {
  return (
    <div className="relative rounded-lg border border-[var(--border)] p-3">
      {/* The arrow sits in the corner it points at, which is where a new tab opens. */}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        title="Open in a new tab"
        aria-label={`${label}: open in a new tab`}
        className="absolute right-2 top-2 rounded p-1 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--muted)] hover:text-[var(--foreground)]"
      >
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </a>
      <p className="pr-8 text-sm font-medium">{label}</p>
      <p className="mt-1 pr-8 text-xs leading-relaxed text-[var(--muted-foreground)]">{note}</p>
      <p className="mt-2 break-all rounded bg-[var(--muted)]/50 p-2 font-mono text-xs">{url}</p>
      <Button className="mt-2" size="sm" variant="outline" onClick={onCopy}>
        Copy
      </Button>
    </div>
  );
}

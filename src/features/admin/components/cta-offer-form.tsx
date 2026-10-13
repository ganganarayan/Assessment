"use client";

import { useState, useTransition } from "react";
import { updateCtaOffer } from "@/features/admin/actions/platform-integrations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MARKETING, TRIAL_CTA, DFY_CTA } from "@/lib/marketing/content";

/**
 * The one call to action, for the whole public site.
 *
 * Three fields, because changing the offer used to be a code edit in
 * src/lib/marketing/content.ts followed by a deploy - and an offer that costs a deploy
 * to change is an offer that stops matching what is actually being sold.
 *
 * Every field shows the shipped default as its PLACEHOLDER, and blank means exactly
 * that default. So the page can never be left with an empty or dead button, and
 * clearing a field is the undo rather than a way to break the site.
 */
export function CtaOfferForm({
  initialHref,
  initialTrialLabel,
  initialDfyLabel,
}: {
  initialHref: string;
  initialTrialLabel: string;
  initialDfyLabel: string;
}) {
  const [href, setHref] = useState(initialHref);
  const [trialLabel, setTrialLabel] = useState(initialTrialLabel);
  const [dfyLabel, setDfyLabel] = useState(initialDfyLabel);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const shownHref = href.trim() || MARKETING.ctaHref;
  const shownTrial = trialLabel.trim() || TRIAL_CTA;
  const shownDfy = dfyLabel.trim() || DFY_CTA;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="cta-href">Where every button goes</Label>
        <Input
          id="cta-href"
          placeholder={MARKETING.ctaHref}
          value={href}
          onChange={(e) => setHref(e.target.value)}
        />
        <p className="text-xs text-[var(--muted-foreground)]">
          A path on this site, like {MARKETING.ctaHref}, or a full https:// URL. Blank uses{" "}
          {MARKETING.ctaHref}. The ad&apos;s utm and click-id parameters are added to it
          automatically, and travel on to signup.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="cta-trial">Trial button</Label>
          <Input
            id="cta-trial"
            placeholder={TRIAL_CTA}
            value={trialLabel}
            onChange={(e) => setTrialLabel(e.target.value)}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            Nav, the hero&apos;s second button, all three priced tiers, the answer pages.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="cta-dfy">Free-build button</Label>
          <Input
            id="cta-dfy"
            placeholder={DFY_CTA}
            value={dfyLabel}
            onChange={(e) => setDfyLabel(e.target.value)}
          />
          <p className="text-xs text-[var(--muted-foreground)]">
            The hero&apos;s first button, the metering and offer blocks, the calculator,
            the comparison pages.
          </p>
        </div>
      </div>

      {/* What the site will actually render, in the two shapes it renders. Worth the
          space: these strings go on about forty buttons, and a label that is three
          words too long is obvious here and invisible in a settings field. */}
      <div className="rounded-lg border bg-[var(--muted)] p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
          On the page
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-md bg-green-600 px-4 text-sm font-medium text-white">
            {shownDfy}
          </span>
          <span className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium">
            {shownTrial}
          </span>
        </div>
        <p className="mt-3 break-all text-xs text-[var(--muted-foreground)]">
          Both go to <span className="font-mono text-[var(--foreground)]">{shownHref}</span>
        </p>
      </div>

      <div className="flex items-center gap-3">
        <Button
          size="sm"
          disabled={pending}
          onClick={() => {
            setMsg(null);
            start(async () => {
              const r = await updateCtaOffer(href, trialLabel, dfyLabel);
              setMsg(r.ok ? "Saved. Every public page now shows this." : r.error);
            });
          }}
        >
          {pending ? "Saving..." : "Save"}
        </Button>
        {msg ? <span className="text-sm text-[var(--muted-foreground)]">{msg}</span> : null}
      </div>
    </div>
  );
}

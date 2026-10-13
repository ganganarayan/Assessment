"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MARKETING, TRIAL_CTA, DFY_CTA } from "@/lib/marketing/content";
import { saveCtaOffer } from "@/features/platform/cta-offer";

/**
 * The call to action for the whole public site - platform only, so it sits here beside
 * the landing videos rather than in /admin/settings. Same reasoning as that card: the
 * marketing site is the shopfront, and /admin is the surface you enter a tenant through.
 *
 * Three fields, because changing the offer used to mean editing
 * src/lib/marketing/content.ts and deploying.
 *
 * Every field shows the shipped wording as its PLACEHOLDER, and blank means exactly
 * that wording. So the page can never be left with an empty or dead button, and
 * clearing a field is the undo rather than a way to break the site.
 */
export function CtaOfferCard({
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
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const shownHref = href.trim() || MARKETING.ctaHref;
  const shownTrial = trialLabel.trim() || TRIAL_CTA;
  const shownDfy = dfyLabel.trim() || DFY_CTA;

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const r = await saveCtaOffer({ href, trialLabel, dfyLabel });
      if (!r.ok) return setError(r.error);
      setSaved(true);
    });

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Landing page call to action</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          One destination and two labels, for every button on every public page: the
          landing page, the thirteen industry pages, pricing, the comparison pages, the
          answer pages, the calculator, the offer bar and the nav. Change the offer here
          instead of in the code.
        </p>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Blank means the shipped wording, so emptying a field puts the default back
          rather than leaving a dead button.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cta-href">Where every button goes</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          A path on this site, or a full https:// URL. The ad&apos;s utm and click-id
          parameters are added automatically and travel on to signup.
        </p>
        <Input
          id="cta-href"
          spellCheck={false}
          placeholder={MARKETING.ctaHref}
          value={href}
          onChange={(e) => setHref(e.target.value)}
        />
      </div>

      <div className="grid gap-4 border-t pt-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cta-trial">Trial button</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            Nav, the hero&apos;s second button, all three priced tiers, the answer pages.
          </p>
          <Input
            id="cta-trial"
            placeholder={TRIAL_CTA}
            value={trialLabel}
            onChange={(e) => setTrialLabel(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cta-dfy">Free-build button</Label>
          <p className="text-xs text-[var(--muted-foreground)]">
            The hero&apos;s first button, the metering and offer blocks, the calculator,
            the comparison pages.
          </p>
          <Input
            id="cta-dfy"
            placeholder={DFY_CTA}
            value={dfyLabel}
            onChange={(e) => setDfyLabel(e.target.value)}
          />
        </div>
      </div>

      {/* What the site will actually render, in the two shapes it renders. Worth the
          space: these strings go on about forty buttons, and a label three words too
          long is obvious here and invisible in a settings field. */}
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

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {saved && !error ? (
        <p className="text-sm text-green-600">Saved. Every public page now shows this.</p>
      ) : null}

      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save call to action"}
        </Button>
      </div>
    </section>
  );
}

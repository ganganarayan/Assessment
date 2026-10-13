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
 * The save is NOT a plain write. The action repairs the link, fetches it, and refuses
 * the save if it does not load - so a missing colon cannot take the funnel off the air
 * while every page still looks perfectly normal. When it repairs something, the
 * corrected value is written back INTO the field here, so the owner sees what was
 * stored instead of having to guess.
 *
 * Every field shows the shipped wording as its PLACEHOLDER, and blank means exactly
 * that wording, so the page can never be left with an empty or dead button.
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
  const [note, setNote] = useState<string | null>(null);
  const [savedUrl, setSavedUrl] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [canForce, setCanForce] = useState(false);
  const [pending, start] = useTransition();

  const shownHref = href.trim() || MARKETING.ctaHref;
  const shownTrial = trialLabel.trim() || TRIAL_CTA;
  const shownDfy = dfyLabel.trim() || DFY_CTA;

  const save = (force = false) =>
    start(async () => {
      setError(null);
      setNote(null);
      setSavedUrl(null);
      setCanForce(false);
      const r = await saveCtaOffer({ href, trialLabel, dfyLabel, force });
      if (!r.ok) {
        // The repaired candidate goes into the field even on failure: it is strictly
        // closer to a working link than what was typed, and the next attempt starts
        // from there rather than from the typo.
        if (r.href !== undefined) setHref(r.href);
        setError(r.error);
        setCanForce(Boolean(r.canForce));
        return;
      }
      setHref(r.href);
      setNote(r.repaired);
      setSavedUrl(r.checkedUrl);
      setUnverified(r.unverified);
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
          Saving opens the link first and refuses it if the page does not load, so a typo
          cannot take the funnel off the air while every page still looks right. Blank
          means the shipped wording.
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cta-href">Where every button goes</Label>
        <p className="text-xs text-[var(--muted-foreground)]">
          A path on this site, or a full https:// address. The ad&apos;s utm and click-id
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

      {error ? (
        <div className="flex flex-col gap-2 rounded-md border border-red-500 bg-red-500/10 p-3">
          <p className="break-all text-sm">{error}</p>
          {canForce ? (
            <div>
              {/* Only ever offered for an unreachable page, never for a 404: a 404 is
                  the site answering that the link is wrong. */}
              <Button variant="outline" size="sm" disabled={pending} onClick={() => save(true)}>
                Save anyway
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {savedUrl !== null || (note && !error) ? (
        <div className="flex flex-col gap-2 rounded-md border border-green-600 bg-green-600/10 p-3">
          <p className="text-sm">
            {note ? `${note} ` : null}
            {unverified
              ? "Saved without the check. Open it and make sure it loads."
              : "Saved, and the page loads. Every public page now shows this."}
          </p>
          {savedUrl ? (
            <div>
              {/* Opened by the owner, not fetched by us: the check above proves the
                  server can reach it, this proves the page is the right page. */}
              <a
                href={savedUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center rounded-md border px-3 text-sm font-medium hover:bg-[var(--muted)]"
              >
                Open the link in a new window
              </a>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3">
        <Button onClick={() => save(false)} disabled={pending}>
          {pending ? "Checking the link…" : "Check link and save"}
        </Button>
      </div>
    </section>
  );
}

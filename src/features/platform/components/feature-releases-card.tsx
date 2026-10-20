"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { setFeatureRelease } from "@/features/platform/feature-releases";
import { type FeatureReleaseStatus } from "@/lib/features/catalog";

/**
 * Feature releases - the switch between "finished" and "customers have it".
 *
 * One switch per feature for EVERY workspace at once, which is the decision this card
 * exists to make obvious: there is no per-tenant choice to hunt for, and no way to end
 * up with four customers on a version nobody can reproduce.
 *
 * Every flip is confirmed in place. Not ceremony: releasing is the moment a few hundred
 * workspaces get a screen they have never seen, and holding back is the moment they
 * lose one they were using. Both deserve a sentence saying so before the click lands.
 */
export function FeatureReleasesCard({ initial }: { initial: FeatureReleaseStatus[] }) {
  const [rows, setRows] = useState(initial);
  const [confirming, setConfirming] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const flip = (key: string, released: boolean) =>
    start(async () => {
      setError(null);
      const r = await setFeatureRelease(key, released);
      if (!r.ok) return setError(r.error);
      setRows((prev) =>
        prev.map((f) =>
          f.key === key
            ? { ...f, released, releasedAt: released ? "just now" : f.releasedAt, changedBy: "you" }
            : f,
        ),
      );
      setConfirming(null);
    });

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Feature releases</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          What customers can see. A held-back feature is finished code that no workspace but yours
          can reach: the menu item is absent, the page redirects, saving is refused and nothing is
          sent. Test it on one of your own internal workspaces first, then release it here, to every
          workspace at once.
        </p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]">
          Holding a feature back again is a kill switch, not a deletion. Nothing a customer
          configured is removed, and switching it on restores exactly what was there.
        </p>
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <ul className="flex flex-col gap-3">
        {rows.map((f) => (
          <li key={f.key} className="flex flex-col gap-2 rounded-md border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">
                  {f.released ? "🟢" : "🟡"} {f.label}
                </span>
                <span className="text-sm text-[var(--muted-foreground)]">{f.blurb}</span>
              </div>
              <span className="text-xs font-medium">
                {f.released ? "Live for customers" : "Held back - your workspaces only"}
              </span>
            </div>

            {!f.released ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                While held back: {f.whileHeld}
              </p>
            ) : null}

            <p className="text-xs text-[var(--muted-foreground)]">
              {f.releasedAt ? `Released ${f.releasedAt}` : "Never released"}
              {f.changedBy ? ` · last changed by ${f.changedBy}` : ""}
              {f.routes.length ? ` · ${f.routes.join(", ")}` : ""}
            </p>

            {confirming === f.key ? (
              <div className="flex flex-col gap-2 rounded-md border border-amber-500 bg-amber-500/10 p-3">
                <p className="text-sm">
                  {f.released
                    ? "Hold this back? Every customer workspace loses the screens and the sending immediately. Their data stays where it is."
                    : "Release this to every customer workspace now? They will see it on their next page load."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" onClick={() => flip(f.key, !f.released)} disabled={pending}>
                    {pending ? "Saving…" : f.released ? "Yes, hold it back" : "Yes, release it"}
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirming(null)} disabled={pending}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div>
                <Button
                  size="sm"
                  variant={f.released ? "outline" : "default"}
                  onClick={() => setConfirming(f.key)}
                  disabled={pending}
                >
                  {f.released ? "Hold back" : "Release to all workspaces"}
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

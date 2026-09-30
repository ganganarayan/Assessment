"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CAPABILITIES } from "@/lib/marketing/content";
import { ALLOWED_EMBED_HOSTS } from "@/lib/marketing/embed";
import { saveLandingVideos } from "@/features/platform/landing-videos";

/**
 * Landing-page videos — platform only, so it lives on /platform rather than
 * /admin/settings. /admin is the impersonation surface; a platform-only setting sitting
 * there is exactly the ambiguity the tenancy work has been removing.
 *
 * One box per slot: the hero, then one per capability tile in the order they appear on
 * the page. A blank box is a valid answer and means "leave that spot as it is" — the
 * hero keeps its image, the tile keeps its plain text layout.
 */
export function LandingVideosCard({
  initialHero,
  initialTiles,
}: {
  initialHero: string;
  initialTiles: Record<string, string>;
}) {
  const [hero, setHero] = useState(initialHero);
  const [tiles, setTiles] = useState<Record<string, string>>(initialTiles);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();

  const filled = (hero.trim() ? 1 : 0) + Object.values(tiles).filter((v) => v.trim()).length;

  const save = () =>
    start(async () => {
      setError(null);
      setSaved(false);
      const r = await saveLandingVideos({ hero, tiles });
      if (!r.ok) return setError(r.error);
      setSaved(true);
    });

  const field = (
    id: string,
    label: string,
    hint: string,
    value: string,
    onChange: (v: string) => void,
  ) => (
    <div key={id} className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <p className="text-xs text-[var(--muted-foreground)]">{hint}</p>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        spellCheck={false}
        placeholder="Paste the embed code or the video URL — leave blank for no video"
        className="w-full rounded-md border bg-[var(--background)] px-3 py-2 font-mono text-xs"
      />
    </div>
  );

  return (
    <section className="flex flex-col gap-4 rounded-lg border p-5">
      <div>
        <h2 className="text-lg font-semibold">Landing page videos</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Paste a video embed to replace the hero image, and one per capability tile. A tile with a
          video shows its heading, then the video, then its text; tiles without one look exactly as
          they do now. {filled} of {CAPABILITIES.length + 1} slots filled.
        </p>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">
          Embed code or plain link, both fine. Only the video address is kept — everything else in a
          pasted snippet is discarded, so nothing can inject scripts into the public page. Allowed
          hosts: {ALLOWED_EMBED_HOSTS}.
        </p>
      </div>

      {field(
        "landing-hero-video",
        "Hero video",
        "Replaces the scorecard image at the top of the page. Blank keeps the image.",
        hero,
        setHero,
      )}

      <div className="flex flex-col gap-4 border-t pt-4">
        <p className="text-sm font-medium">Capability tiles</p>
        {CAPABILITIES.map((c) =>
          field(
            `landing-tile-${c.title}`,
            c.title,
            c.body.length > 110 ? `${c.body.slice(0, 110)}…` : c.body,
            tiles[c.title] ?? "",
            (v) => setTiles((prev) => ({ ...prev, [c.title]: v })),
          ),
        )}
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}
      {saved && !error ? <p className="text-sm text-green-600">Saved. The landing page is updated.</p> : null}

      <div>
        <Button onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save videos"}
        </Button>
      </div>
    </section>
  );
}

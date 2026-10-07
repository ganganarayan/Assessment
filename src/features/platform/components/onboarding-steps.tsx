import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * What a new workspace has to do, in the order it has to be done.
 *
 * Shown on the first screen for the length of the trial. The video is optional and the
 * steps are not: a video nobody has recorded yet must never be the only instruction, so
 * the written sequence stands alone and the video sits above it when there is one.
 *
 * Step 1 is the Meta pixel because nothing downstream reports anything without it. A
 * funnel built before the pixel is set collects leads and tells the ad account nothing,
 * and that silence looks exactly like a funnel that is not working.
 */
export function OnboardingSteps({ videoUrl, steps }: { videoUrl: string | null; steps: string[] }) {
  // Nothing authored and no video means nothing to show. An empty numbered list reads
  // as steps somebody forgot to write, which is worse than no panel at all.
  if (steps.length === 0 && !videoUrl) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Start here</CardTitle>
        <p className="text-sm text-[var(--muted-foreground)]">
          What to do first. This panel goes away when your trial ends.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-5">
        {videoUrl ? (
          <div className="overflow-hidden rounded-lg border">
            {/* A plain iframe: the URL is set by the platform owner in Settings, not by a
                tenant, so there is no untrusted input here. */}
            <iframe
              src={videoUrl}
              title="Getting started with Assess360"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              className="aspect-video w-full"
            />
          </div>
        ) : null}

        {steps.length > 0 ? (
          <ol className="flex flex-col gap-3">
            {steps.map((step, i) => (
              <li key={`${i}-${step}`} className="flex gap-3">
                <span
                  aria-hidden="true"
                  className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-xs font-semibold text-white"
                >
                  {i + 1}
                </span>
                <p className="min-w-0 text-sm leading-relaxed">{step}</p>
              </li>
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}

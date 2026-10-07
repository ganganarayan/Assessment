import Link from "next/link";
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
const STEPS: ReadonlyArray<{ title: string; body: string; href?: string; linkLabel?: string }> = [
  {
    title: "Add your Meta pixel and Conversions API token",
    body:
      "Settings → Ads & payments. Nothing is reported to your ad account until this is set, so do it before you send any traffic. The pixel id and the token both come from Meta Events Manager.",
    href: "/w/settings",
    linkLabel: "Open Settings",
  },
  {
    title: "Build your first assessment",
    body:
      "Write the questions, set the scores, and add a qualification gate if you only want to hear from people who fit. The gate is what stops you paying to talk to everyone.",
    href: "/w/assessments",
    linkLabel: "New assessment",
  },
  {
    title: "Publish it and copy the link",
    body:
      "A published assessment gets a public link you can run ads to, share, or put on your site. Nothing is live until you publish.",
    href: "/w/assessments",
    linkLabel: "Your assessments",
  },
  {
    title: "Send traffic and watch Stats",
    body:
      "Stats shows the whole funnel: who viewed, who passed the gate, who opted in, who finished. The events your ad account optimises on are listed there too, so you can see what Meta actually received.",
    href: "/w/stats",
    linkLabel: "Open Stats",
  },
  {
    title: "Connect your CRM, then upgrade when you are ready",
    body:
      "Webhooks push every lead to your own systems as it arrives. Your trial has the full product in it; upgrade before it ends and nothing pauses.",
    href: "/w/billing",
    linkLabel: "Billing",
  },
];

export function OnboardingSteps({ videoUrl }: { videoUrl: string | null }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Start here</CardTitle>
        <p className="text-sm text-[var(--muted-foreground)]">
          Five steps to a funnel that is actually reporting. This panel goes away when your
          trial ends.
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

        <ol className="flex flex-col gap-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex gap-3">
              <span
                aria-hidden="true"
                className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-green-600 text-xs font-semibold text-white"
              >
                {i + 1}
              </span>
              <div className="min-w-0">
                <p className="font-medium">{step.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-[var(--muted-foreground)]">
                  {step.body}
                </p>
                {step.href ? (
                  <Link
                    href={step.href}
                    className="mt-1 inline-block text-sm font-medium underline underline-offset-4"
                  >
                    {step.linkLabel ?? "Open"}
                  </Link>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}

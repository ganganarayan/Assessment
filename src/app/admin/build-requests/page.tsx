import { prisma } from "@/lib/db/prisma";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DfyRequests, type DfyRow } from "@/features/admin/components/dfy-requests";
import { OFFER_SLOTS } from "@/lib/marketing/content";

/**
 * The done-for-you queue, the build checklist and the handover note.
 *
 * All three on one screen because they are one job done in order, and splitting them
 * across three pages is how step four gets skipped on install eleven.
 *
 * Platform-only. An applicant is not a tenant - most never become one - so there is no
 * workspace these rows could be scoped to.
 */
export const dynamic = "force-dynamic";

/**
 * The checklist.
 *
 * Written from what this product actually refuses to do when half-configured rather than
 * from a generic onboarding template. The publish lock, the exclusion audience and the
 * test event are each here because skipping one produces a funnel that LOOKS live and
 * reports nothing, which is the expensive failure: it is invisible until somebody asks
 * why the ad account has no conversions.
 */
const CHECKLIST: ReadonlyArray<{ group: string; items: ReadonlyArray<string> }> = [
  {
    group: "Before the call",
    items: [
      "Read their 'who is a bad lead' answer first. The gate is written from it, and nothing else on the form tells you anything the website would not.",
      "Build the gate questions. Gate on capacity, fit and timing, never on role - role is a lead-form field, not a filter.",
      "Write the scored questions in weighted categories, and check the weights sum to what you intended.",
      "Set three result bands that tile 0 to 100 with no gap, and give each one a named next step rather than encouragement.",
      "Write the AI result instructions, or turn the AI statement off. Do not leave it on with no instructions.",
      "Leave it in DRAFT. The draft is what they see in their dashboard before the call starts.",
    ],
  },
  {
    group: "On the 30-minute call",
    items: [
      "Paste their Meta pixel ID and the Conversions API token into Settings. Publishing is blocked without both, unless they tick 'we do not use Meta'.",
      "Fire a test event and confirm it arrives in Events Manager while they are watching. This is the step that proves the wiring, and it is the one most often skipped.",
      "Create the exclusion audience from the disqualified event, and the retargeting audience from qualified completions.",
      "Point their custom domain at it and wait for the certificate to go green before claiming it works.",
      "Check the lead form collects what their sales process actually needs, and nothing it does not.",
      "Set the retake policy. The default locks a repeat attempt, which is usually right and occasionally not.",
      "Publish, then open the live link on a phone and complete it once as a qualified visitor and once as a disqualified one.",
    ],
  },
  {
    group: "Before you hang up",
    items: [
      "Confirm the submission appeared under Submissions and the lead carries the fields you expected.",
      "Confirm the qualified completion reported as a conversion, and the disqualified one did not create a lead at all.",
      "Show them where the results live, where to export, and where the webhook settings are.",
      "Send the handover note below.",
      "Decrement the slot count in Settings.",
    ],
  },
];

const HANDOVER = `Your scorecard is live.

LINK
<paste the live link>

WHAT IT SCREENS OUT
<the gate questions, in plain words, and what each one is there to stop>

WHAT YOUR ADS NOW LEARN
- Qualified completions report as their own conversion event, so optimise campaigns on that, not on leads.
- Disqualified visitors build an exclusion audience. Add it to every campaign as an exclusion.
- Qualified completions build a retargeting audience.

WHAT TO WATCH IN WEEK ONE
- Your lead count will FALL. That is the mechanism working, not a fault.
- Watch cost per qualified lead instead, and give the ad account about a week to re-learn.
- If nobody is passing the gate, one question is too strict. Tell us which answers people are being stopped on and we will loosen it.
- If everybody is passing, it is too loose and is costing you calls.

ANYTHING BREAKS, REPLY TO THIS MESSAGE.`;

export default async function BuildRequestsPage() {
  await requireSuperAdmin();

  const rows = await prisma.dfyRequest.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
  });

  const data: DfyRow[] = rows.map((r) => ({
    ...r,
    notifiedAt: r.notifiedAt ? r.notifiedAt.toISOString() : null,
    createdAt: r.createdAt.toISOString(),
  }));

  const open = rows.filter((r) => r.status === "NEW" || r.status === "CONTACTED").length;
  const built = rows.filter((r) => r.status === "BUILT").length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Build requests</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {open} open · {built} built of {OFFER_SLOTS} · every submission from /build lands here,
          whether or not the email alert reached you.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">The queue</CardTitle>
          <CardDescription>
            Open one to read what they said makes a bad lead. That answer is what the gate gets
            written from.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DfyRequests rows={data} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Build checklist</CardTitle>
          <CardDescription>
            The same steps in the same order, every install. Each item here exists because
            skipping it produces a funnel that looks live and reports nothing.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {CHECKLIST.map((g) => (
            <div key={g.group}>
              <p className="text-sm font-semibold">{g.group}</p>
              <ul className="mt-2 flex flex-col gap-2">
                {g.items.map((it) => (
                  <li key={it} className="flex items-start gap-2 text-sm text-[var(--muted-foreground)]">
                    <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-green-600" />
                    <span>{it}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Handover note</CardTitle>
          <CardDescription>
            Sent at the end of the call. The week-one expectations matter more than the rest of
            it: a client who is not told their lead count will fall reads the mechanism working
            as the product failing, and says so before anyone can explain.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border bg-[var(--muted)] p-4 text-xs leading-relaxed">
            {HANDOVER}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}

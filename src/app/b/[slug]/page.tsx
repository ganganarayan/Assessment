import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { LOCATION_HINT } from "@/features/calendar/types";
import { publicBookingView } from "@/features/calendar/data";
import { PublicBooking } from "@/features/calendar/components/public-booking";

/**
 * The public booking page: /b/<slug>.
 *
 * Resolved by slug alone, like /a/<slug>, which is why BookingType.slug is globally
 * unique. Serves on whatever host the request arrived on, so a tenant's own domain
 * works with no extra routing.
 *
 * ?t=<result token> is how a booking gets attached to the funnel that produced it: the
 * result page's CTA passes it, this page prefills the lead from it, and the booking
 * action re-checks it against the submission. Without it the page still works, as a
 * plain booking link.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const t = await prisma.bookingType.findFirst({
    where: { slug, active: true },
    select: { name: true, description: true, tenant: { select: { name: true } } },
  });
  if (!t) return { title: "Booking" };
  return {
    title: `${t.name} with ${t.tenant.name}`,
    description: t.description ?? undefined,
    // A personal diary page has no business in a search index.
    robots: { index: false, follow: false },
  };
}

export default async function BookingPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const view = await publicBookingView(slug);
  if (!view) notFound();

  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? (v[0] ?? "") : (v ?? ""));
  const resultToken = first(query.t);
  const preview = first(query.preview) === "1";

  // Prefill from the respondent's own submission when they came from their result page.
  // Scoped to the token's own row, so there is nothing here to enumerate.
  const submission = resultToken
    ? await prisma.submission.findFirst({
        where: { resultToken },
        select: { leadFirstName: true, leadLastName: true, leadEmail: true, leadMobile: true },
      })
    : null;

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-2xl flex-col gap-6 px-4 py-8">
      <header className="flex flex-col gap-2">
        <p className="text-xs uppercase tracking-wide text-[var(--muted-foreground)]">{view.hostName}</p>
        <h1 className="text-2xl font-bold tracking-tight">{view.name}</h1>
        <p className="text-sm text-[var(--muted-foreground)]">
          {view.durationMin} minutes · {LOCATION_HINT[view.locationKind]}
        </p>
        {view.description ? <p className="text-sm">{view.description}</p> : null}
        {preview ? (
          <p className="rounded-md border border-dashed px-3 py-2 text-xs text-[var(--muted-foreground)]">
            Preview. The booking is real and appears in your calendar; nothing is reported to Meta.
          </p>
        ) : null}
      </header>

      <PublicBooking
        view={view}
        resultToken={resultToken}
        preview={preview}
        prefill={{
          name: [submission?.leadFirstName, submission?.leadLastName].filter(Boolean).join(" "),
          email: submission?.leadEmail ?? "",
          mobile: submission?.leadMobile ?? "",
        }}
      />
    </main>
  );
}

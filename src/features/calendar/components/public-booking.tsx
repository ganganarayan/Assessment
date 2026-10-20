"use client";

import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { LOCATION_HINT, type BookingConfirmation, type PublicBookingView } from "@/features/calendar/types";
import { bookSlot, prefillForBooking } from "@/features/calendar/booking";
import { getOrCreateExternalId } from "@/lib/external-id";

/**
 * The respondent's booking page. Mobile first, and deliberately three steps on one
 * screen: pick a day, pick a time, say who you are. A multi-page wizard loses people
 * between pages, and this is the step the whole funnel exists to reach.
 *
 * Times are IST, said out loud, because the alternative is a respondent in another
 * timezone guessing. Converting to their local time would be a lie unless we knew it.
 */
export function PublicBooking({
  view,
  resultToken,
  preview,
  prefill,
}: {
  view: PublicBookingView;
  /** From ?t= on the link, when it carried one. May be filled in on mount instead. */
  resultToken: string;
  preview: boolean;
  prefill: { name: string; email: string; mobile: string };
}) {
  const [dateKey, setDateKey] = useState<string>(view.days[0]?.dateKey ?? "");
  const [startMs, setStartMs] = useState<number | null>(null);
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [mobile, setMobile] = useState(prefill.mobile);
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<BookingConfirmation | null>(null);
  const [pending, start] = useTransition();
  // The token can arrive two ways: on the link, or from the lookup below. Either way it
  // is what attaches this booking to the submission they already made.
  const [token, setToken] = useState(resultToken);
  const [recognised, setRecognised] = useState(prefill.email !== "");

  /**
   * They opted in two screens ago. Fill the form in for them.
   *
   * Only when the link carried no ?t= and nothing came from the server: a link sent by
   * email already identifies its reader, and this is for the bare link. The handle is
   * the first-party id in their own localStorage, the same one the funnel wrote to their
   * submission, so it works on the browser they filled the assessment in on and quietly
   * does nothing on any other. Failure is silence: an unrecognised visitor simply types
   * their details, which is what they would have done anyway.
   */
  useEffect(() => {
    if (prefill.email || resultToken) return;
    const vid = getOrCreateExternalId();
    if (!vid) return;
    let cancelled = false;
    void prefillForBooking(view.slug, vid).then((r) => {
      if (cancelled || !r.ok || !r.data) return;
      // Never overwrite something they have already started typing.
      setName((cur) => cur || r.data!.name);
      setEmail((cur) => cur || r.data!.email);
      setMobile((cur) => cur || r.data!.mobile);
      setToken((cur) => cur || r.data!.resultToken);
      setRecognised(true);
    });
    return () => {
      cancelled = true;
    };
  }, [prefill.email, resultToken, view.slug]);

  const day = view.days.find((d) => d.dateKey === dateKey) ?? null;

  if (done) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">You are booked in</h2>
        <p className="text-sm">
          <strong>{done.startLabel}</strong> IST, {done.durationMin} minutes, with {view.hostName}.
        </p>
        {done.locationValue ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {LOCATION_HINT[done.locationKind]}:{" "}
            {done.locationKind === "MEET_LINK" ? (
              <a className="underline" href={done.locationValue} target="_blank" rel="noreferrer">
                {done.locationValue}
              </a>
            ) : (
              <span>{done.locationValue}</span>
            )}
          </p>
        ) : (
          <p className="text-sm text-[var(--muted-foreground)]">{LOCATION_HINT[done.locationKind]}.</p>
        )}
        <div>
          <a
            href={done.icsUrl}
            className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-[var(--muted)]"
          >
            Add to my calendar
          </a>
        </div>
        {/* Deliberately promises NO email. Reminders and confirmations are the
            automation's job and arrive with it; a page that says "check your inbox"
            before that exists sends people looking for something nobody sent. */}
        <p className="text-xs text-[var(--muted-foreground)]">
          Booked under {email}. Add it to your calendar above so it is not forgotten.
        </p>
      </div>
    );
  }

  if (view.days.length === 0) {
    return (
      <div className="rounded-lg border p-5">
        <h2 className="text-base font-semibold">No times are open right now</h2>
        <p className="mt-1 text-sm text-[var(--muted-foreground)]">
          Every slot in the next few weeks is taken. Please check back shortly.
        </p>
      </div>
    );
  }

  const submit = () =>
    start(async () => {
      setError(null);
      if (startMs == null) {
        setError("Pick a time first.");
        return;
      }
      const r = await bookSlot({ slug: view.slug, startMs, name, email, mobile, notes, resultToken: token, preview });
      if (r.ok && r.data) {
        setDone(r.data);
      } else if (!r.ok) {
        setError(r.error);
      }
    });

  return (
    <div className="flex flex-col gap-5">
      {/* Step 1: the day */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Pick a day</h2>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {view.days.map((d) => (
            <button
              key={d.dateKey}
              type="button"
              onClick={() => {
                setDateKey(d.dateKey);
                setStartMs(null);
              }}
              className={cn(
                "shrink-0 rounded-md border px-3 py-2 text-sm",
                dateKey === d.dateKey ? "border-green-600 bg-green-600/10 font-medium" : "hover:bg-[var(--muted)]",
              )}
            >
              {d.label}
            </button>
          ))}
        </div>
      </section>

      {/* Step 2: the time */}
      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold">Pick a time (IST)</h2>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {(day?.slots ?? []).map((s) => (
            <button
              key={s.startMs}
              type="button"
              onClick={() => setStartMs(s.startMs)}
              className={cn(
                "rounded-md border px-2 py-2 text-sm",
                startMs === s.startMs ? "border-green-600 bg-green-600/10 font-medium" : "hover:bg-[var(--muted)]",
              )}
            >
              {s.timeLabel}
            </button>
          ))}
        </div>
        {day && day.slots.length === 0 ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nothing open on this day.</p>
        ) : null}
      </section>

      {/* Step 3: who */}
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold">Your details</h2>
        {/* Said out loud rather than filled in silently. Finding your own name already
            typed into a page you have not typed it into is unsettling if nothing
            explains it, and the whole point is that they do not have to type it. */}
        {recognised ? (
          <p className="text-xs text-[var(--muted-foreground)]">
            Filled in from your earlier answers. Change anything that is out of date.
          </p>
        ) : null}
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Email</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Mobile (optional)</Label>
          <Input value={mobile} onChange={(e) => setMobile(e.target.value)} autoComplete="tel" inputMode="tel" />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Anything we should know? (optional)</Label>
          <Textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>

        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

        <Button onClick={submit} disabled={pending} className="w-full sm:w-auto">
          {pending ? "Booking…" : "Confirm booking"}
        </Button>
      </section>
    </div>
  );
}

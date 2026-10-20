"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LOCATION_HINT, type ManageBookingView } from "@/features/calendar/types";
import { cancelMyBooking, rescheduleMyBooking } from "@/features/calendar/manage";

/**
 * "Change or cancel my booking", from the respondent's side.
 *
 * Reschedule is offered FIRST and cancel is the quieter option below it, because the
 * two are not equal outcomes: somebody whose Tuesday fell through usually still wants
 * the call, and a page that leads with Cancel gets what it asked for.
 */
export function ManageBooking({ view }: { view: ManageBookingView }) {
  const [current, setCurrent] = useState(view);
  const [picking, setPicking] = useState(false);
  const [dateKey, setDateKey] = useState<string>(view.days[0]?.dateKey ?? "");
  const [startMs, setStartMs] = useState<number | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<"cancelled" | "moved" | null>(null);
  const [pending, start] = useTransition();

  const day = current.days.find((d) => d.dateKey === dateKey) ?? null;

  if (done === "cancelled") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Your booking is cancelled</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Thank you for letting {current.hostName} know. The slot is free for somebody else.
        </p>
        {current.bookAgainPath ? (
          <a
            href={current.bookAgainPath}
            className="inline-flex h-10 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-[var(--muted)] sm:w-auto"
          >
            Book another time
          </a>
        ) : null}
      </div>
    );
  }

  if (done === "moved") {
    return (
      <div className="flex flex-col gap-3 rounded-lg border p-5">
        <h2 className="text-lg font-semibold">Your call has moved</h2>
        <p className="text-sm">
          <strong>{current.startLabel}</strong> IST, {current.durationMin} minutes, with {current.hostName}.
        </p>
        <p className="text-xs text-[var(--muted-foreground)]">
          This page keeps working, so you can change it again from the same link.
        </p>
      </div>
    );
  }

  const act = (fn: () => Promise<{ ok: boolean; error?: string }>, after: () => void) =>
    start(async () => {
      setError(null);
      const r = await fn();
      if (r.ok) after();
      else setError(r.error ?? "That did not work. Please try again.");
    });

  return (
    <div className="flex flex-col gap-5">
      {/* What they have now */}
      <section className="flex flex-col gap-2 rounded-lg border p-5">
        <h2 className="text-base font-semibold">{current.what}</h2>
        <p className="text-sm">
          <strong>{current.startLabel}</strong> IST · {current.durationMin} minutes · with {current.hostName}
        </p>
        {current.locationValue && current.locationKind ? (
          <p className="text-sm text-[var(--muted-foreground)]">
            {LOCATION_HINT[current.locationKind]}:{" "}
            {current.locationKind === "MEET_LINK" ? (
              <a className="underline" href={current.locationValue} target="_blank" rel="noreferrer">
                {current.locationValue}
              </a>
            ) : (
              current.locationValue
            )}
          </p>
        ) : null}
        {current.closedReason ? (
          <p className="text-sm text-[var(--muted-foreground)]">{current.closedReason}</p>
        ) : null}
      </section>

      {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}

      {current.canChange ? (
        <>
          {/* Move it. First, and the only one that keeps the call. */}
          <section className="flex flex-col gap-3">
            {!picking ? (
              <Button onClick={() => setPicking(true)} className="w-full sm:w-auto">
                Move it to another time
              </Button>
            ) : current.days.length === 0 ? (
              <p className="rounded-md border border-dashed px-3 py-2 text-sm text-[var(--muted-foreground)]">
                No other times are open at the moment. You can cancel below and book again later.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Pick a day</h3>
                  <div className="flex gap-2 overflow-x-auto pb-1">
                    {current.days.map((d) => (
                      <button
                        key={d.dateKey}
                        type="button"
                        onClick={() => {
                          setDateKey(d.dateKey);
                          setStartMs(null);
                        }}
                        className={cn(
                          "shrink-0 rounded-md border px-3 py-2 text-sm",
                          dateKey === d.dateKey
                            ? "border-green-600 bg-green-600/10 font-medium"
                            : "hover:bg-[var(--muted)]",
                        )}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold">Pick a time (IST)</h3>
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {(day?.slots ?? []).map((s) => (
                      <button
                        key={s.startMs}
                        type="button"
                        onClick={() => setStartMs(s.startMs)}
                        className={cn(
                          "rounded-md border px-2 py-2 text-sm",
                          startMs === s.startMs
                            ? "border-green-600 bg-green-600/10 font-medium"
                            : "hover:bg-[var(--muted)]",
                        )}
                      >
                        {s.timeLabel}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={pending || startMs == null}
                    onClick={() =>
                      act(
                        () => rescheduleMyBooking(current.token, startMs as number),
                        () => {
                          // Say the NEW time back, rather than asking them to trust that
                          // the press worked. The slot they chose is the one we know.
                          const chosen = day?.slots.find((s) => s.startMs === startMs);
                          setCurrent((c) => ({
                            ...c,
                            startLabel: chosen
                              ? `${day?.label ?? ""} ${chosen.timeLabel}`.trim()
                              : c.startLabel,
                          }));
                          setDone("moved");
                        },
                      )
                    }
                  >
                    {pending ? "Moving…" : "Confirm new time"}
                  </Button>
                  <Button variant="ghost" onClick={() => setPicking(false)} disabled={pending}>
                    Keep my current time
                  </Button>
                </div>
              </>
            )}
          </section>

          {/* Cancel. Quieter, and one press away from being final, so it is a decision
              rather than a slip on a phone. */}
          <section className="flex flex-col gap-2 border-t pt-4">
            {confirmCancel ? (
              <div className="flex flex-col gap-2">
                <p className="text-sm">
                  Cancel this call? {current.hostName} will be told, and the slot goes back to
                  whoever wants it.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    disabled={pending}
                    onClick={() => act(() => cancelMyBooking(current.token), () => setDone("cancelled"))}
                  >
                    {pending ? "Cancelling…" : "Yes, cancel it"}
                  </Button>
                  <Button variant="ghost" onClick={() => setConfirmCancel(false)} disabled={pending}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="self-start text-sm text-[var(--muted-foreground)] underline"
                onClick={() => setConfirmCancel(true)}
              >
                I need to cancel this call
              </button>
            )}
          </section>
        </>
      ) : current.bookAgainPath ? (
        <a
          href={current.bookAgainPath}
          className="inline-flex h-10 w-full items-center justify-center rounded-md border px-4 text-sm font-medium hover:bg-[var(--muted)] sm:w-auto"
        >
          Book another time
        </a>
      ) : null}
    </div>
  );
}

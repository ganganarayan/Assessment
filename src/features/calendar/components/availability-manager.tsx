"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { minutesToHHMM } from "@/lib/calendar/slots";
import {
  LOCATION_LABEL,
  WEEKDAY_LABELS,
  type BookingTypeRow,
  type PickerOption,
  type BookingLocationKindValue,
} from "@/features/calendar/types";
import {
  addAvailabilityException,
  addAvailabilityRule,
  deleteAvailabilityException,
  deleteAvailabilityRule,
  deleteBookingType,
  rotateCalendarFeed,
  saveBookingType,
} from "@/features/calendar/actions";

/**
 * Availability: what can be booked, when, and the subscription link that puts it all in
 * the owner's own calendar app.
 *
 * One screen rather than three, because the three questions are one decision: a booking
 * link with no windows takes no bookings, and a window with no link belongs to nothing.
 */

interface FormValues {
  name: string;
  slug: string;
  description: string;
  durationMin: string;
  bufferMin: string;
  noticeMin: string;
  horizonDays: string;
  slotStepMin: string;
  maxPerDay: string;
  locationKind: BookingLocationKindValue;
  locationValue: string;
  active: boolean;
  assignedUserId: string;
  assignmentMode: "SINGLE" | "ROUND_ROBIN";
  memberIds: string[];
  assessmentId: string;
  adAccountId: string;
  fireMetaCapi: boolean;
  metaBookedEvent: string;
  metaCancelledEvent: string;
  metaAttendedEvent: string;
  metaNoShowEvent: string;
}

const BLANK: FormValues = {
  name: "",
  slug: "",
  description: "",
  durationMin: "30",
  bufferMin: "0",
  noticeMin: "120",
  horizonDays: "30",
  slotStepMin: "0",
  maxPerDay: "",
  locationKind: "MEET_LINK",
  locationValue: "",
  active: true,
  assignedUserId: "",
  assignmentMode: "SINGLE",
  memberIds: [],
  assessmentId: "",
  adAccountId: "",
  fireMetaCapi: true,
  metaBookedEvent: "Schedule",
  metaCancelledEvent: "AppointmentCancelled",
  metaAttendedEvent: "AppointmentAttended",
  metaNoShowEvent: "AppointmentNoShow",
};

const valuesOf = (t: BookingTypeRow): FormValues => ({
  name: t.name,
  slug: t.slug,
  description: t.description ?? "",
  durationMin: String(t.durationMin),
  bufferMin: String(t.bufferMin),
  noticeMin: String(t.noticeMin),
  horizonDays: String(t.horizonDays),
  slotStepMin: String(t.slotStepMin),
  maxPerDay: t.maxPerDay == null ? "" : String(t.maxPerDay),
  locationKind: t.locationKind,
  locationValue: t.locationValue ?? "",
  active: t.active,
  assignedUserId: t.assignedUserId ?? "",
  assignmentMode: t.assignmentMode,
  memberIds: t.memberIds,
  assessmentId: t.assessmentId ?? "",
  adAccountId: t.adAccountId ?? "",
  fireMetaCapi: t.fireMetaCapi,
  metaBookedEvent: t.metaBookedEvent,
  metaCancelledEvent: t.metaCancelledEvent,
  metaAttendedEvent: t.metaAttendedEvent,
  metaNoShowEvent: t.metaNoShowEvent,
});

/** "30-minute strategy call" to "30-minute-strategy-call". */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

export function AvailabilityManager({
  bookingTypes,
  assessments,
  adAccounts,
  staff,
  feedPath,
  canEdit,
}: {
  bookingTypes: BookingTypeRow[];
  assessments: PickerOption[];
  adAccounts: PickerOption[];
  /** Who a link can be assigned to: one calendar per staff member. */
  staff: PickerOption[];
  /** Null until somebody generates one. A path; made absolute below. */
  feedPath: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [path, setPath] = useState<string | null>(feedPath);

  /**
   * 🔴 Every absolute link on this screen is built from the origin being browsed, the
   * same rule the funnel links follow. The server used to manufacture one from the
   * tenant's slug and root domain, which printed apply-gita.orbitq-assess… - a host
   * with no DNS behind it - and the owner copied a dead link out of their own app.
   *
   * Read after mount rather than during render, so the server and client markup agree.
   */
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const absolute = (p: string) => `${origin}${p}`;
  const url = path ? absolute(path) : null;

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? done : (r.error ?? "That did not work."));
      if (r.ok) router.refresh();
    });

  return (
    <div className="flex flex-col gap-6">
      {msg ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--muted-foreground)]">{msg}</p>
      ) : null}

      {/* The subscription feed */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-semibold">See these bookings in your own calendar</h2>
          <p className="text-xs text-[var(--muted-foreground)]">
            Add this address to Google Calendar, Apple Calendar or Outlook as a subscribed calendar and
            your bookings show up there. It is read-only, and anyone with the link can read it, so
            rotate it if it ever gets out.
          </p>
        </div>
        {url ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Input readOnly value={url} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
            {canEdit ? (
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() =>
                  start(async () => {
                    const r = await rotateCalendarFeed();
                    if (r.ok && r.data) {
                      setPath(r.data.path);
                      setMsg("New link generated. The old one stops working now.");
                    } else if (!r.ok) {
                      setMsg(r.error);
                    }
                  })
                }
              >
                Rotate
              </Button>
            ) : null}
          </div>
        ) : canEdit ? (
          <div>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await rotateCalendarFeed();
                  if (r.ok && r.data) {
                    setPath(r.data.path);
                    setMsg("Feed link generated.");
                  } else if (!r.ok) {
                    setMsg(r.error);
                  }
                })
              }
            >
              Generate feed link
            </Button>
          </div>
        ) : (
          <p className="text-xs text-[var(--muted-foreground)]">
            No feed link yet. An admin can generate one from this page.
          </p>
        )}
      </section>

      {/* Booking links */}
      <section className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Booking links</h2>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setCreating((v) => !v)}>
              {creating ? "Close" : "New booking link"}
            </Button>
          ) : null}
        </div>

        {creating ? (
          <BookingTypeForm
            initial={BLANK}
            assessments={assessments}
            adAccounts={adAccounts}
            staff={staff}
            pending={pending}
            onSubmit={(v) => run(() => saveBookingType(toInput(v)), "Booking link created.")}
          />
        ) : null}

        {bookingTypes.length === 0 && !creating ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-[var(--muted-foreground)]">
            Nothing can be booked yet. Create a booking link, give it some weekly hours, and share the
            address it gets.
          </p>
        ) : null}

        {bookingTypes.map((t) => (
          <article key={t.id} className="flex flex-col gap-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-semibold">
                  {t.name}{" "}
                  <span className="font-normal text-[var(--muted-foreground)]">
                    · {t.durationMin} min · {LOCATION_LABEL[t.locationKind]}
                  </span>
                </h3>
                <a href={t.publicPath} target="_blank" rel="noreferrer" className="text-xs underline">
                  {origin ? absolute(t.publicPath) : t.publicPath}
                </a>
                {/* The loop back to the funnel, which is easy to miss: this address in a
                    result-page button sends the respondent to a form already filled in,
                    and the call that follows carries their score and their ad. */}
                <span className="text-xs text-[var(--muted-foreground)]">
                  Paste this into a button on a result page and the person arrives with their
                  details already filled in.
                </span>
                <span className="text-xs text-[var(--muted-foreground)]">
                  {t.assignedUserName ? `${t.assignedUserName} · ` : ""}
                  {t.active ? "Taking bookings" : "Switched off"}
                  {t.upcomingCount > 0 ? ` · ${t.upcomingCount} upcoming` : ""}
                  {t.assessmentTitle ? ` · attached to ${t.assessmentTitle}` : ""}
                </span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => setOpenId((cur) => (cur === t.id ? null : t.id))}>
                  {openId === t.id ? "Close" : "Edit hours and settings"}
                </Button>
                {canEdit ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => run(() => deleteBookingType(t.id), "Booking link deleted.")}
                  >
                    Delete
                  </Button>
                ) : null}
              </div>
            </div>

            {openId === t.id ? (
              <div className="flex flex-col gap-4">
                <BookingTypeForm
                  initial={valuesOf(t)}
                  assessments={assessments}
                  adAccounts={adAccounts}
                  staff={staff}
                  pending={pending}
                  onSubmit={(v) => run(() => saveBookingType(toInput(v), t.id), "Booking link saved.")}
                />

                {/* Weekly hours */}
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Weekly hours (IST)
                  </h4>
                  {WEEKDAY_LABELS.map((label, weekday) => {
                    const windows = t.rules.filter((r) => r.weekday === weekday);
                    return (
                      <div key={label} className="flex flex-wrap items-center gap-2 border-b py-1.5 last:border-b-0">
                        <span className="w-24 text-xs">{label}</span>
                        {windows.length === 0 ? (
                          <span className="text-xs text-[var(--muted-foreground)]">Not available</span>
                        ) : (
                          windows.map((w) => (
                            <span
                              key={w.id}
                              className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                            >
                              {minutesToHHMM(w.startMin)} to {minutesToHHMM(w.endMin)}
                              {canEdit ? (
                                <button
                                  type="button"
                                  aria-label="Remove this window"
                                  className="text-[var(--muted-foreground)] hover:text-red-600"
                                  disabled={pending}
                                  onClick={() => run(() => deleteAvailabilityRule(w.id), "Window removed.")}
                                >
                                  ×
                                </button>
                              ) : null}
                            </span>
                          ))
                        )}
                        {canEdit ? (
                          <WindowAdder
                            pending={pending}
                            onAdd={(startTime, endTime) =>
                              run(
                                () =>
                                  addAvailabilityRule({
                                    bookingTypeId: t.id,
                                    weekday,
                                    start: startTime,
                                    end: endTime,
                                  }),
                                "Window added.",
                              )
                            }
                          />
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                {/* Dates off and extra dates */}
                <div className="flex flex-col gap-2 rounded-md border border-dashed p-3">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
                    Specific dates
                  </h4>
                  <p className="text-xs text-[var(--muted-foreground)]">
                    A day off beats the weekly hours, even hours added later. Leave the times blank for the
                    whole day.
                  </p>
                  {t.exceptions.length === 0 ? (
                    <span className="text-xs text-[var(--muted-foreground)]">Nothing set.</span>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {t.exceptions.map((e) => (
                        <li key={e.id} className="flex flex-wrap items-center gap-2 text-xs">
                          <span className="rounded-full border px-2 py-0.5">
                            {e.kind === "BLOCK" ? "Off" : "Open"} · {e.dateKey}
                            {e.startMin != null && e.endMin != null
                              ? ` · ${minutesToHHMM(e.startMin)} to ${minutesToHHMM(e.endMin)}`
                              : " · all day"}
                            {e.note ? ` · ${e.note}` : ""}
                          </span>
                          {canEdit ? (
                            <button
                              type="button"
                              className="text-[var(--muted-foreground)] hover:text-red-600"
                              disabled={pending}
                              onClick={() => run(() => deleteAvailabilityException(e.id), "Date removed.")}
                            >
                              Remove
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canEdit ? (
                    <ExceptionAdder
                      pending={pending}
                      onAdd={(values) =>
                        run(() => addAvailabilityException({ bookingTypeId: t.id, ...values }), "Date saved.")
                      }
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}

/** Form values to the shape the action's schema parses. */
function toInput(v: FormValues) {
  return {
    ...v,
    durationMin: v.durationMin,
    bufferMin: v.bufferMin,
    noticeMin: v.noticeMin,
    horizonDays: v.horizonDays,
    slotStepMin: v.slotStepMin,
    maxPerDay: v.maxPerDay,
  };
}

function BookingTypeForm({
  initial,
  assessments,
  adAccounts,
  staff,
  pending,
  onSubmit,
}: {
  initial: FormValues;
  assessments: PickerOption[];
  adAccounts: PickerOption[];
  staff: PickerOption[];
  pending: boolean;
  onSubmit: (values: FormValues) => void;
}) {
  const [v, setV] = useState<FormValues>(initial);
  const [showMeta, setShowMeta] = useState(false);
  const set = (patch: Partial<FormValues>) => setV((cur) => ({ ...cur, ...patch }));
  const editing = initial.slug !== "";

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">What is being booked</Label>
          <Input
            value={v.name}
            placeholder="30-minute strategy call"
            onChange={(e) => {
              const name = e.target.value;
              // The link follows the name until the link has been saved once. After
              // that it is left alone: changing a published address silently breaks
              // every ad and email pointing at it.
              set(editing ? { name } : { name, slug: slugify(name) });
            }}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Public link (/b/…)</Label>
          <Input value={v.slug} onChange={(e) => set({ slug: slugify(e.target.value) })} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">What to expect (shown on the booking page)</Label>
        <Textarea rows={2} value={v.description} onChange={(e) => set({ description: e.target.value })} />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Length (minutes)</Label>
          <Input type="number" min={5} value={v.durationMin} onChange={(e) => set({ durationMin: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Gap after (minutes)</Label>
          <Input type="number" min={0} value={v.bufferMin} onChange={(e) => set({ bufferMin: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Least notice (minutes)</Label>
          <Input type="number" min={0} value={v.noticeMin} onChange={(e) => set({ noticeMin: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Book up to (days ahead)</Label>
          <Input type="number" min={1} value={v.horizonDays} onChange={(e) => set({ horizonDays: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Start every (minutes, 0 = length + gap)</Label>
          <Input type="number" min={0} value={v.slotStepMin} onChange={(e) => set({ slotStepMin: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Most per day (blank = no limit)</Label>
          <Input type="number" min={1} value={v.maxPerDay} onChange={(e) => set({ maxPerDay: e.target.value })} />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Where</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={v.locationKind}
            onChange={(e) => set({ locationKind: e.target.value as BookingLocationKindValue })}
          >
            {(Object.keys(LOCATION_LABEL) as BookingLocationKindValue[]).map((k) => (
              <option key={k} value={k}>
                {LOCATION_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">
            {v.locationKind === "MEET_LINK" ? "Meeting link" : v.locationKind === "PHONE" ? "Number to call" : "Address"}
          </Label>
          <Input
            value={v.locationValue}
            onChange={(e) => set({ locationValue: e.target.value })}
            placeholder={v.locationKind === "MEET_LINK" ? "https://meet.google.com/…" : ""}
          />
        </div>
      </div>

      {/* Whose calendar this link sells time in. One link per staff member: the hours on
          it are that person's hours, and a lead who opens it books that person. */}
      {staff.length > 1 ? (
        <div className="flex flex-col gap-2">
          <Label className="text-xs">Who takes these calls</Label>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { mode: "SINGLE" as const, label: "One person" },
                { mode: "ROUND_ROBIN" as const, label: "A team, in turn" },
              ]
            ).map((opt) => (
              <button
                key={opt.mode}
                type="button"
                onClick={() => set({ assignmentMode: opt.mode })}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  v.assignmentMode === opt.mode
                    ? "border-green-600 bg-green-600/10 font-medium"
                    : "hover:bg-[var(--muted)]",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {v.assignmentMode === "SINGLE" ? (
            <div className="flex flex-col gap-1">
              <select
                className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
                value={v.assignedUserId}
                onChange={(e) => set({ assignedUserId: e.target.value })}
              >
                <option value="">The workspace calendar</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[var(--muted-foreground)]">
                The hours below are this person&apos;s hours, and a slot is offered only when their
                own diary is free. Two staff members can both be booked at 11:00.
              </span>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap gap-2">
                {staff.map((s) => {
                  const on = v.memberIds.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() =>
                        set({
                          memberIds: on
                            ? v.memberIds.filter((id) => id !== s.id)
                            : [...v.memberIds, s.id],
                        })
                      }
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        on ? "border-green-600 bg-green-600/10 font-medium" : "hover:bg-[var(--muted)]",
                      )}
                    >
                      {on ? "✓ " : ""}
                      {s.label}
                    </button>
                  );
                })}
              </div>
              {/* The two things somebody choosing a team has to know, and neither is
                  obvious from the switch alone. */}
              <span className="text-xs text-[var(--muted-foreground)]">
                The hours below are the team&apos;s hours, and a time stays bookable until
                everybody on it is taken. Each booking goes to whoever has waited longest among
                those free, so a busy week does not push the same person to the back forever.
              </span>
              {v.memberIds.length === 0 ? (
                <span className="text-xs text-amber-600 dark:text-amber-400">
                  Pick at least one person, or this link can take no bookings at all.
                </span>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Attach to an assessment (optional)</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={v.assessmentId}
            onChange={(e) => set({ assessmentId: e.target.value })}
          >
            <option value="">Not attached</option>
            {assessments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Report to ad account</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={v.adAccountId}
            onChange={(e) => set({ adAccountId: e.target.value })}
          >
            <option value="">This workspace&apos;s default</option>
            {adAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.active} onChange={(e) => set({ active: e.target.checked })} />
        Taking bookings
      </label>

      <div className="flex flex-col gap-2 rounded-md border p-3">
        <button
          type="button"
          className="self-start text-xs underline"
          onClick={() => setShowMeta((s) => !s)}
        >
          {showMeta ? "Hide" : "Show"} what gets reported to Meta
        </button>
        {showMeta ? (
          <>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.fireMetaCapi}
                onChange={(e) => set({ fireMetaCapi: e.target.checked })}
              />
              Report bookings and outcomes to Meta
            </label>
            <p className="text-xs text-[var(--muted-foreground)]">
              A booking is reported as the standard <strong>Schedule</strong> event, which Meta can
              optimise delivery for. The other three are custom events: useful as audiences, and the
              reason to mark who showed up.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Booked</Label>
                <Input value={v.metaBookedEvent} onChange={(e) => set({ metaBookedEvent: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Showed up</Label>
                <Input value={v.metaAttendedEvent} onChange={(e) => set({ metaAttendedEvent: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">No show</Label>
                <Input value={v.metaNoShowEvent} onChange={(e) => set({ metaNoShowEvent: e.target.value })} />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">Cancelled</Label>
                <Input value={v.metaCancelledEvent} onChange={(e) => set({ metaCancelledEvent: e.target.value })} />
              </div>
            </div>
          </>
        ) : null}
      </div>

      <div>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(v)}>
          {pending ? "Saving…" : editing ? "Save" : "Create"}
        </Button>
      </div>
    </div>
  );
}

function WindowAdder({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("10:00");
  const [end, setEnd] = useState("13:00");

  if (!open) {
    return (
      <button type="button" className="text-xs underline" onClick={() => setOpen(true)}>
        Add hours
      </button>
    );
  }
  return (
    <span className="flex flex-wrap items-center gap-1">
      <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-28 text-xs" />
      <span className="text-xs">to</span>
      <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-28 text-xs" />
      <Button
        size="sm"
        disabled={pending}
        onClick={() => {
          onAdd(start, end);
          setOpen(false);
        }}
      >
        Add
      </Button>
      <button type="button" className="text-xs underline" onClick={() => setOpen(false)}>
        Cancel
      </button>
    </span>
  );
}

function ExceptionAdder({
  pending,
  onAdd,
}: {
  pending: boolean;
  onAdd: (values: { date: string; kind: "BLOCK" | "OPEN"; start: string; end: string; note: string }) => void;
}) {
  const [date, setDate] = useState("");
  const [kind, setKind] = useState<"BLOCK" | "OPEN">("BLOCK");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [note, setNote] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Date</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Then</Label>
        <select
          className="h-8 rounded-md border bg-[var(--background)] px-2 text-xs text-[var(--foreground)]"
          value={kind}
          onChange={(e) => setKind(e.target.value as "BLOCK" | "OPEN")}
        >
          <option value="BLOCK">I am not available</option>
          <option value="OPEN">I am available</option>
        </select>
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">From</Label>
        <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} className="h-8 w-28 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">To</Label>
        <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} className="h-8 w-28 text-xs" />
      </div>
      <div className="flex flex-col gap-1">
        <Label className="text-xs">Note</Label>
        <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 text-xs" placeholder="Holiday" />
      </div>
      <Button
        size="sm"
        disabled={pending || !date}
        onClick={() => {
          onAdd({ date, kind, start, end, note });
          setDate("");
          setStart("");
          setEnd("");
          setNote("");
        }}
      >
        Save date
      </Button>
    </div>
  );
}

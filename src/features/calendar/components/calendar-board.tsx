"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  STATUS_CLASS,
  STATUS_LABEL,
  WEEKDAY_SHORT,
  type AppointmentRow,
  type PickerOption,
} from "@/features/calendar/types";
import {
  cancelAppointment,
  createManualAppointment,
  markAttendance,
  updateAppointment,
} from "@/features/calendar/actions";

/**
 * The calendar: a month at a glance, the selected day in detail, and the one list that
 * makes the whole feature pay for itself - calls that have happened and whose outcome
 * nobody has marked yet.
 *
 * Month navigation is a LINK, not client state (?m=YYYY-MM), so the server fetches that
 * month. A client-side month would mean holding a year of appointments in the browser
 * to avoid a round trip nobody minds.
 */

interface BookingTypeOption extends PickerOption {
  durationMin: number;
}

export function CalendarBoard({
  monthKey,
  monthLabel,
  prevMonth,
  nextMonth,
  todayMonth,
  todayKey,
  rows,
  awaitingOutcome,
  bookingTypes,
  canEdit,
  basePath,
}: {
  monthKey: string;
  monthLabel: string;
  prevMonth: string;
  nextMonth: string;
  todayMonth: string;
  todayKey: string;
  rows: AppointmentRow[];
  awaitingOutcome: AppointmentRow[];
  bookingTypes: BookingTypeOption[];
  canEdit: boolean;
  /** "/w/calendar" or "/admin/calendar", so the same board serves both rails. */
  basePath: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [selected, setSelected] = useState<string>(() =>
    monthKey === todayMonth ? todayKey : `${monthKey}-01`,
  );
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<AppointmentRow | null>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const r of rows) {
      const list = map.get(r.dateKey) ?? [];
      list.push(r);
      map.set(r.dateKey, list);
    }
    return map;
  }, [rows]);

  const dayRows = byDate.get(selected) ?? [];

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done);
        setAdding(false);
        setEditing(null);
        router.refresh();
      } else {
        setMsg(r.error ?? "That did not work.");
      }
    });

  return (
    <div className="flex flex-col gap-6">
      {msg ? (
        <p className="rounded-md bg-[var(--muted)]/40 px-3 py-2 text-sm text-[var(--muted-foreground)]">{msg}</p>
      ) : null}

      {/* The outcome queue. First on the page on purpose: a booking tells an ad account
          somebody meant to come, and only this tells it whether they did. */}
      {awaitingOutcome.length > 0 ? (
        <section className="flex flex-col gap-3 rounded-lg border border-amber-500/50 p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-semibold">
              {awaitingOutcome.length} call{awaitingOutcome.length === 1 ? "" : "s"} waiting on an outcome
            </h2>
            <p className="text-xs text-[var(--muted-foreground)]">
              Marking these is what sends the real result back to your ad account. Until you do, Meta
              only knows the booking was made.
            </p>
          </div>
          <ul className="flex flex-col gap-2">
            {awaitingOutcome.map((a) => (
              <li
                key={a.id}
                className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{a.attendeeName ?? a.title ?? "Appointment"}</span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {a.startLabel} · {a.bookingTypeName ?? "Manual"}
                  </span>
                </div>
                {canEdit ? (
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={pending}
                      onClick={() => run(() => markAttendance(a.id, "ATTENDED"), "Marked as showed up.")}
                    >
                      Showed up
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => run(() => markAttendance(a.id, "NO_SHOW"), "Marked as a no show.")}
                    >
                      No show
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Month header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <Link
            href={`${basePath}?m=${prevMonth}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Previous
          </Link>
          <Link
            href={`${basePath}?m=${todayMonth}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Today
          </Link>
          <Link
            href={`${basePath}?m=${nextMonth}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Next
          </Link>
        </div>
      </div>

      <MonthGrid
        monthKey={monthKey}
        byDate={byDate}
        selected={selected}
        todayKey={todayKey}
        onSelect={(key) => {
          setSelected(key);
          setEditing(null);
          setAdding(false);
        }}
      />

      {/* The selected day */}
      <section className="flex flex-col gap-3 rounded-lg border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold">{istPretty(selected)}</h3>
          {canEdit ? (
            <Button size="sm" variant="outline" onClick={() => setAdding((v) => !v)}>
              {adding ? "Close" : "Add to calendar"}
            </Button>
          ) : null}
        </div>

        {adding ? (
          <AppointmentForm
            dateKey={selected}
            bookingTypes={bookingTypes}
            pending={pending}
            onSubmit={(values) => run(() => createManualAppointment(values), "Added to the calendar.")}
          />
        ) : null}

        {dayRows.length === 0 && !adding ? (
          <p className="text-sm text-[var(--muted-foreground)]">Nothing booked on this day.</p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {dayRows.map((a) => (
            <li key={a.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    {a.timeLabel} · {a.bookingTypeName ?? a.title ?? "Blocked out"}
                  </span>
                  {a.attendeeName || a.attendeeEmail ? (
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {[a.attendeeName, a.attendeeEmail, a.attendeeMobile].filter(Boolean).join(" · ")}
                    </span>
                  ) : null}
                  {a.notes ? <span className="mt-1 text-xs text-[var(--muted-foreground)]">{a.notes}</span> : null}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span
                    className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[a.status])}
                  >
                    {STATUS_LABEL[a.status]}
                  </span>
                  {a.isPreview ? (
                    <span className="text-xs text-[var(--muted-foreground)]">Preview, not reported</span>
                  ) : null}
                </div>
              </div>

              {canEdit ? (
                <div className="flex flex-wrap gap-2">
                  {a.status === "BOOKED" ? (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => markAttendance(a.id, "ATTENDED"), "Marked as showed up.")}
                      >
                        Showed up
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={pending}
                        onClick={() => run(() => markAttendance(a.id, "NO_SHOW"), "Marked as a no show.")}
                      >
                        No show
                      </Button>
                    </>
                  ) : null}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setEditing((cur) => (cur?.id === a.id ? null : a))}
                  >
                    {editing?.id === a.id ? "Close" : "Edit"}
                  </Button>
                  {a.status !== "CANCELLED" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      onClick={() => run(() => cancelAppointment(a.id), "Cancelled, and the slot is free again.")}
                    >
                      Cancel
                    </Button>
                  ) : null}
                  {a.submissionId ? (
                    <Link
                      href={`${basePath.replace("/calendar", "")}/submissions?focus=${a.submissionId}`}
                      className="self-center text-xs underline"
                    >
                      See their answers
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {editing?.id === a.id ? (
                <AppointmentForm
                  dateKey={a.dateKey}
                  bookingTypes={bookingTypes}
                  pending={pending}
                  initial={a}
                  onSubmit={(values) => run(() => updateAppointment(a.id, values), "Appointment updated.")}
                />
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ----------------------------------------------------------------- the grid --- */

function MonthGrid({
  monthKey,
  byDate,
  selected,
  todayKey,
  onSelect,
}: {
  monthKey: string;
  byDate: Map<string, AppointmentRow[]>;
  selected: string;
  todayKey: string;
  onSelect: (dateKey: string) => void;
}) {
  // The leading blanks and the day count, computed from the month key itself: a Date
  // built from "YYYY-MM-01T00:00:00Z" is read with getUTC*, so the grid never shifts a
  // day because the browser is in another timezone.
  const first = new Date(`${monthKey}-01T00:00:00.000Z`);
  const leading = first.getUTCDay();
  const daysInMonth = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  ).getUTCDate();

  const cells: (string | null)[] = [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${monthKey}-${String(i + 1).padStart(2, "0")}`),
  ];

  return (
    <div className="overflow-hidden rounded-lg border">
      <div className="grid grid-cols-7 border-b bg-[var(--muted)]/30 text-center text-xs font-medium">
        {WEEKDAY_SHORT.map((d) => (
          <div key={d} className="px-1 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((key, i) => {
          if (!key) return <div key={`blank-${i}`} className="min-h-16 border-b border-r bg-[var(--muted)]/10" />;
          const rows = byDate.get(key) ?? [];
          const live = rows.filter((r) => r.status !== "CANCELLED");
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              className={cn(
                "flex min-h-16 flex-col items-start gap-1 border-b border-r p-1 text-left hover:bg-[var(--muted)]/40",
                selected === key && "bg-[var(--muted)]/60",
              )}
            >
              <span
                className={cn(
                  "text-xs",
                  key === todayKey
                    ? "rounded-full bg-green-600 px-1.5 text-white"
                    : "text-[var(--muted-foreground)]",
                )}
              >
                {Number(key.slice(-2))}
              </span>
              {live.slice(0, 2).map((r) => (
                <span key={r.id} className="w-full truncate text-[10px] leading-tight">
                  {r.timeLabel} {r.attendeeName ?? r.title ?? r.bookingTypeName ?? ""}
                </span>
              ))}
              {live.length > 2 ? (
                <span className="text-[10px] text-[var(--muted-foreground)]">+{live.length - 2} more</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- the form --- */

interface FormValues {
  bookingTypeId: string;
  date: string;
  start: string;
  end: string;
  title: string;
  notes: string;
  attendeeName: string;
  attendeeEmail: string;
  attendeeMobile: string;
}

function AppointmentForm({
  dateKey,
  bookingTypes,
  pending,
  initial,
  onSubmit,
}: {
  dateKey: string;
  bookingTypes: BookingTypeOption[];
  pending: boolean;
  initial?: AppointmentRow;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>({
    bookingTypeId: initial?.bookingTypeId ?? "",
    date: initial?.dateKey ?? dateKey,
    start: initial?.timeLabel ?? "10:00",
    end: "",
    title: initial?.title ?? "",
    notes: initial?.notes ?? "",
    attendeeName: initial?.attendeeName ?? "",
    attendeeEmail: initial?.attendeeEmail ?? "",
    attendeeMobile: initial?.attendeeMobile ?? "",
  });
  const set = (patch: Partial<FormValues>) => setValues((v) => ({ ...v, ...patch }));

  return (
    <div className="flex flex-col gap-3 rounded-md border border-dashed p-3">
      <p className="text-xs text-[var(--muted-foreground)]">
        Pick a booking link to record a call somebody asked for by phone, which reports to Meta like
        any other booking. Leave it blank to block out your own time, which only holds the slot.
      </p>

      {/* The booking type is fixed once the row exists: it decides the duration, the
          location and which pixel the booking already reported to. */}
      {initial ? null : (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Booking link</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={values.bookingTypeId}
            onChange={(e) => set({ bookingTypeId: e.target.value })}
          >
            <option value="">Blocked out time (no booking)</option>
            {bookingTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label} ({t.durationMin} min)
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Date</Label>
          <Input type="date" value={values.date} onChange={(e) => set({ date: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Start (IST)</Label>
          <Input type="time" value={values.start} onChange={(e) => set({ start: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">End (optional)</Label>
          <Input
            type="time"
            value={values.end}
            onChange={(e) => set({ end: e.target.value })}
            placeholder="uses the duration"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Name</Label>
          <Input value={values.attendeeName} onChange={(e) => set({ attendeeName: e.target.value })} />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={values.attendeeEmail}
            onChange={(e) => set({ attendeeEmail: e.target.value })}
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Mobile</Label>
          <Input value={values.attendeeMobile} onChange={(e) => set({ attendeeMobile: e.target.value })} />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Title (used when there is no booking link)</Label>
        <Input value={values.title} onChange={(e) => set({ title: e.target.value })} placeholder="Lunch, travel, admin" />
      </div>

      <div className="flex flex-col gap-1">
        <Label className="text-xs">Notes</Label>
        <Textarea rows={2} value={values.notes} onChange={(e) => set({ notes: e.target.value })} />
      </div>

      <div>
        <Button size="sm" disabled={pending} onClick={() => onSubmit(values)}>
          {pending ? "Saving…" : initial ? "Save changes" : "Add"}
        </Button>
      </div>
    </div>
  );
}

const MONTHS_LONG = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** "Monday, 20 October 2026" from an IST date key. Never toLocaleDateString, which
 *  renders in the browser's locale and would show US order to its owner. */
function istPretty(dateKey: string): string {
  const d = new Date(`${dateKey}T00:00:00.000Z`);
  const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return `${weekdays[d.getUTCDay()]}, ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

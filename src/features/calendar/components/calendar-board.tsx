"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
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
  deleteAppointment,
  markAttendance,
  updateAppointment,
} from "@/features/calendar/actions";

/**
 * The calendar: a month at a glance, and the grid itself is the interface.
 *
 * Clicking a booking opens that booking. Clicking an empty day starts a new one on that
 * day. There is no panel below holding a second copy of the same actions, because a
 * calendar where the thing you clicked is not the thing that opens is a calendar people
 * stop clicking.
 *
 * Month navigation is a LINK, not client state (?m=YYYY-MM), so the server fetches that
 * month rather than the browser holding a year of appointments to avoid a round trip
 * nobody minds.
 */

interface BookingTypeOption extends PickerOption {
  durationMin: number;
}

type Dialog =
  | { kind: "appointment"; row: AppointmentRow }
  | { kind: "new"; dateKey: string }
  | { kind: "day"; dateKey: string }
  | null;

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
  staff,
  who,
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
  /** Everybody whose calendar this workspace runs. */
  staff: PickerOption[];
  /** The filter in force: "all", "shared", or a staff id. */
  who: string;
  canEdit: boolean;
  /** "/w/calendar" or "/admin/calendar", so the same board serves both rails. */
  basePath: string;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [dialog, setDialog] = useState<Dialog>(null);

  const byDate = useMemo(() => {
    const map = new Map<string, AppointmentRow[]>();
    for (const r of rows) {
      const list = map.get(r.dateKey) ?? [];
      list.push(r);
      map.set(r.dateKey, list);
    }
    return map;
  }, [rows]);

  // The open appointment, re-read from the freshly loaded rows: after an action the
  // server sends new data, and a dialog still rendering its captured copy would show
  // "Booked" next to the Showed up button that was just pressed.
  const open: Dialog = useMemo(() => {
    if (dialog?.kind !== "appointment") return dialog;
    const fresh = rows.find((r) => r.id === dialog.row.id);
    return fresh ? { kind: "appointment", row: fresh } : null;
  }, [dialog, rows]);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, close = true) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      if (r.ok) {
        setMsg(done);
        if (close) setDialog(null);
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
                <button
                  type="button"
                  className="flex flex-col text-left"
                  onClick={() => setDialog({ kind: "appointment", row: a })}
                >
                  <span className="text-sm font-medium underline-offset-2 hover:underline">
                    {a.attendeeName ?? a.title ?? "Appointment"}
                  </span>
                  <span className="text-xs text-[var(--muted-foreground)]">
                    {a.startLabel} · {a.bookingTypeName ?? "Manual"}
                  </span>
                </button>
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
            href={`${basePath}?m=${prevMonth}&who=${who}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Previous
          </Link>
          <Link
            href={`${basePath}?m=${todayMonth}&who=${who}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Today
          </Link>
          <Link
            href={`${basePath}?m=${nextMonth}&who=${who}`}
            className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
          >
            Next
          </Link>
        </div>
      </div>

      {/* Whose calendar. Shown only once there is more than one person to choose
          between: a one-person workspace has no filter to offer and no decision to
          make, and a row of chips saying "Everyone" would be furniture. */}
      {staff.length > 1 ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--muted-foreground)]">Calendar</span>
          {[
            { key: "all", label: "Everyone" },
            ...staff.map((s) => ({ key: s.id, label: s.label })),
            { key: "shared", label: "Workspace" },
          ].map((opt) => (
            <Link
              key={opt.key}
              href={`${basePath}?m=${monthKey}&who=${opt.key}`}
              className={cn(
                "rounded-full border px-3 py-1 text-xs",
                who === opt.key ? "border-green-600 bg-green-600/10 font-medium" : "hover:bg-[var(--muted)]",
              )}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      ) : null}

      <p className="text-xs text-[var(--muted-foreground)]">
        Click a booking to open it. Click any empty day to add one.
      </p>

      <MonthGrid
        monthKey={monthKey}
        byDate={byDate}
        todayKey={todayKey}
        canEdit={canEdit}
        onOpenAppointment={(row) => setDialog({ kind: "appointment", row })}
        onOpenDay={(dateKey) => setDialog({ kind: "day", dateKey })}
        onNew={(dateKey) => setDialog({ kind: "new", dateKey })}
      />

      {open?.kind === "appointment" ? (
        <AppointmentDialog
          row={open.row}
          canEdit={canEdit}
          pending={pending}
          onClose={() => setDialog(null)}
          onRun={run}
        />
      ) : null}

      {open?.kind === "new" ? (
        <Modal title={`New booking · ${istPretty(open.dateKey)}`} onClose={() => setDialog(null)}>
          <AppointmentForm
            dateKey={open.dateKey}
            bookingTypes={bookingTypes}
            staff={staff}
            pending={pending}
            onSubmit={(values) => run(() => createManualAppointment(values), "Added to the calendar.")}
          />
        </Modal>
      ) : null}

      {open?.kind === "day" ? (
        <Modal title={istPretty(open.dateKey)} onClose={() => setDialog(null)}>
          <ul className="flex flex-col gap-2">
            {(byDate.get(open.dateKey) ?? []).map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border p-3 text-left hover:bg-[var(--muted)]/40"
                  onClick={() => setDialog({ kind: "appointment", row: a })}
                >
                  <span className="flex flex-col">
                    <span className="text-sm font-medium">
                      {a.timeLabel} · {a.attendeeName ?? a.title ?? a.bookingTypeName ?? "Appointment"}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">
                      {a.bookingTypeName ?? "Blocked out"}
                    </span>
                  </span>
                  <span className={cn("rounded-full border px-2 py-0.5 text-xs", STATUS_CLASS[a.status])}>
                    {STATUS_LABEL[a.status]}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {canEdit ? (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() => setDialog({ kind: "new", dateKey: open.dateKey })}
            >
              Add a booking on this day
            </Button>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- the grid --- */

function MonthGrid({
  monthKey,
  byDate,
  todayKey,
  canEdit,
  onOpenAppointment,
  onOpenDay,
  onNew,
}: {
  monthKey: string;
  byDate: Map<string, AppointmentRow[]>;
  todayKey: string;
  canEdit: boolean;
  onOpenAppointment: (row: AppointmentRow) => void;
  onOpenDay: (dateKey: string) => void;
  onNew: (dateKey: string) => void;
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
          if (!key) return <div key={`blank-${i}`} className="min-h-20 border-b border-r bg-[var(--muted)]/10" />;
          const dayRows = byDate.get(key) ?? [];
          const shown = dayRows.slice(0, 2);
          return (
            // A DIV, not a button: the chips inside are buttons of their own, and a
            // button inside a button is invalid markup that browsers resolve by
            // dropping one of the two click handlers.
            <div
              key={key}
              role={canEdit ? "button" : undefined}
              tabIndex={canEdit ? 0 : undefined}
              aria-label={canEdit ? `Add a booking on ${key}` : undefined}
              onClick={() => canEdit && onNew(key)}
              onKeyDown={(e) => {
                if (!canEdit) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onNew(key);
                }
              }}
              className={cn(
                "flex min-h-20 flex-col items-start gap-1 border-b border-r p-1 text-left",
                canEdit && "cursor-pointer hover:bg-[var(--muted)]/30",
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

              {shown.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  // Stop the cell's "new booking" handler: clicking a booking means
                  // that booking, never a second one on top of it.
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenAppointment(r);
                  }}
                  className={cn(
                    "w-full truncate rounded px-1 py-0.5 text-left text-[10px] leading-tight hover:bg-[var(--muted)]",
                    r.status === "CANCELLED" && "line-through opacity-60",
                    r.status === "NO_SHOW" && "text-red-600 dark:text-red-400",
                    r.status === "ATTENDED" && "text-emerald-600 dark:text-emerald-400",
                  )}
                  title={`${r.timeLabel} ${r.attendeeName ?? r.title ?? ""} · ${STATUS_LABEL[r.status]}`}
                >
                  {r.timeLabel} {r.attendeeName ?? r.title ?? r.bookingTypeName ?? ""}
                </button>
              ))}

              {dayRows.length > shown.length ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenDay(key);
                  }}
                  className="px-1 text-[10px] text-[var(--muted-foreground)] underline"
                >
                  +{dayRows.length - shown.length} more
                </button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- modal --- */

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  // Escape closes, and nothing behind it scrolls while it is up.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        // The backdrop closes; the panel must not, or every click inside dismisses it.
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-lg border bg-[var(--background)] p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded px-2 text-lg leading-none text-[var(--muted-foreground)] hover:bg-[var(--muted)]"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* -------------------------------------------------------- appointment dialog --- */

function AppointmentDialog({
  row,
  canEdit,
  pending,
  onClose,
  onRun,
}: {
  row: AppointmentRow;
  canEdit: boolean;
  pending: boolean;
  onClose: () => void;
  onRun: (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, close?: boolean) => void;
}) {
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const live = row.status === "BOOKED";
  const started = new Date(row.startAt).getTime() <= Date.now() + 60_000;

  return (
    <Modal title={row.attendeeName ?? row.title ?? row.bookingTypeName ?? "Appointment"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2 py-0.5 text-xs font-medium", STATUS_CLASS[row.status])}>
            {STATUS_LABEL[row.status]}
          </span>
          {row.isPreview ? (
            <span className="text-xs text-[var(--muted-foreground)]">Preview, not reported</span>
          ) : null}
          {row.metaOutcome ? (
            <span className="text-xs text-[var(--muted-foreground)]">Outcome reported to Meta</span>
          ) : row.metaBooked ? (
            <span className="text-xs text-[var(--muted-foreground)]">Booking reported to Meta</span>
          ) : null}
        </div>

        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
          <dt className="text-[var(--muted-foreground)]">When</dt>
          <dd>{row.startLabel} IST</dd>
          <dt className="text-[var(--muted-foreground)]">What</dt>
          <dd>{row.bookingTypeName ?? "Blocked out time"}</dd>
          <dt className="text-[var(--muted-foreground)]">Calendar</dt>
          <dd>{row.assignedUserName ?? "Workspace"}</dd>
          {row.attendeeEmail ? (
            <>
              <dt className="text-[var(--muted-foreground)]">Email</dt>
              <dd className="break-all">{row.attendeeEmail}</dd>
            </>
          ) : null}
          {row.attendeeMobile ? (
            <>
              <dt className="text-[var(--muted-foreground)]">Mobile</dt>
              <dd>{row.attendeeMobile}</dd>
            </>
          ) : null}
          {row.locationValue ? (
            <>
              <dt className="text-[var(--muted-foreground)]">Where</dt>
              <dd className="break-all">{row.locationValue}</dd>
            </>
          ) : null}
          {row.notes ? (
            <>
              <dt className="text-[var(--muted-foreground)]">Notes</dt>
              <dd className="whitespace-pre-wrap">{row.notes}</dd>
            </>
          ) : null}
        </dl>

        {/* The meeting made for this person, with one press to take it. An owner who
            has to select a URL out of a page before they can paste it into a chat has
            been given a link in name only. */}
        {row.zoomJoinUrl ? <MeetingLink url={row.zoomJoinUrl} /> : null}
        {row.zoomError && !row.zoomJoinUrl ? (
          <p className="text-xs text-red-600 dark:text-red-400">
            The meeting link could not be created: {row.zoomError}
          </p>
        ) : null}

        {canEdit ? (
          <>
            {/* The outcome, while the call is still open and has already started. */}
            {live && started ? (
              <div className="flex flex-wrap gap-2 border-t pt-3">
                <Button
                  size="sm"
                  disabled={pending}
                  onClick={() => onRun(() => markAttendance(row.id, "ATTENDED"), "Marked as showed up.")}
                >
                  Showed up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => onRun(() => markAttendance(row.id, "NO_SHOW"), "Marked as a no show.")}
                >
                  No show
                </Button>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 border-t pt-3">
              <Button size="sm" variant="outline" onClick={() => setMode(mode === "edit" ? "view" : "edit")}>
                {mode === "edit" ? "Close editor" : "Edit or reschedule"}
              </Button>
              {row.status !== "CANCELLED" ? (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    onRun(() => cancelAppointment(row.id), "Cancelled, and the slot is free again.")
                  }
                >
                  Cancel booking
                </Button>
              ) : null}
              <Button size="sm" variant="ghost" onClick={() => setConfirmDelete((v) => !v)}>
                Delete
              </Button>
            </div>

            {confirmDelete ? (
              <div className="flex flex-col gap-2 rounded-md border border-red-500/60 p-3">
                <p className="text-xs">
                  Delete removes this from the calendar and tells nobody. If the person is expecting the
                  call, <strong>cancel</strong> instead: that frees the slot, reaches your CRM and reports
                  the cancellation to Meta. A conversion already sent cannot be unsent by deleting.
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => onRun(() => deleteAppointment(row.id), "Deleted.")}
                  >
                    Delete permanently
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : null}

            {mode === "edit" ? (
              <AppointmentForm
                dateKey={row.dateKey}
                bookingTypes={[]}
                staff={[]}
                pending={pending}
                initial={row}
                onSubmit={(values) =>
                  onRun(
                    () => updateAppointment(row.id, values),
                    "Saved. A moved booking is reported as a reschedule.",
                  )
                }
              />
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

/* ----------------------------------------------------------------- the form --- */

interface FormValues {
  bookingTypeId: string;
  assignedUserId: string;
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
  staff,
  pending,
  initial,
  onSubmit,
}: {
  dateKey: string;
  bookingTypes: BookingTypeOption[];
  staff: PickerOption[];
  pending: boolean;
  initial?: AppointmentRow;
  onSubmit: (values: FormValues) => void;
}) {
  const [values, setValues] = useState<FormValues>({
    bookingTypeId: initial?.bookingTypeId ?? "",
    assignedUserId: initial?.assignedUserId ?? "",
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
      {initial ? (
        <p className="text-xs text-[var(--muted-foreground)]">
          Changing the date or time reschedules the booking, which is reported to your CRM as a
          reschedule. The booking link cannot change: it decides the length, the location and the pixel
          this booking already reported to.
        </p>
      ) : (
        <p className="text-xs text-[var(--muted-foreground)]">
          Pick a booking link to record a call somebody asked for by phone, which reports to Meta like
          any other booking. Leave it blank to block out your own time, which only holds the slot.
        </p>
      )}

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

      {/* Whose time is being blocked. Only for a BLOCK: a booking belongs to the
          calendar its link sells, which is why the picker disappears the moment a link
          is chosen rather than offering a contradiction. */}
      {!initial && !values.bookingTypeId && staff.length > 1 ? (
        <div className="flex flex-col gap-1">
          <Label className="text-xs">Whose calendar</Label>
          <select
            className="h-9 rounded-md border bg-[var(--background)] px-2 text-sm text-[var(--foreground)]"
            value={values.assignedUserId}
            onChange={(e) => set({ assignedUserId: e.target.value })}
          >
            <option value="">The workspace calendar</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      ) : null}

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
        <Input
          value={values.title}
          onChange={(e) => set({ title: e.target.value })}
          placeholder="Lunch, travel, admin"
        />
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

/**
 * The meeting link, with one press to take it.
 *
 * Copy falls back to selecting the text when the clipboard is unavailable - an insecure
 * context, a browser that refuses the permission - because the one thing this must not
 * do is look like it worked and leave an empty clipboard.
 */
function MeetingLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <div className="flex flex-col gap-1 rounded-md border p-2">
      <span className="text-xs text-[var(--muted-foreground)]">Meeting link</span>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded border bg-[var(--background)] px-2 py-1 font-mono text-xs"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(url);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              // Nothing to apologise for: the field is right there and selectable.
            }
          }}
        >
          {copied ? "Copied" : "Copy"}
        </Button>
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="rounded-md border px-3 py-1.5 text-sm hover:bg-[var(--muted)]"
        >
          Open
        </a>
      </div>
    </div>
  );
}

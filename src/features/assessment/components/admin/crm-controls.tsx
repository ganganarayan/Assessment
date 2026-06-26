"use client";

import { type CrmPendingRow } from "@/features/admin/actions/crm-resend";

function hourLabel(h: number): string {
  const ampm = h < 12 ? "AM" : "PM";
  const hr = h % 12 === 0 ? 12 : h % 12;
  return `${hr}:00 ${ampm}`;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);

/** AM/PM time-of-day picker; value is the IST hour 0-23. */
export function HourSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: number;
  onChange: (h: number) => void;
  ariaLabel?: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      aria-label={ariaLabel}
      className="h-9 rounded-md border border-[var(--border)] bg-[var(--background)] px-2 text-sm"
    >
      {HOURS.map((h) => (
        <option key={h} value={h}>
          {hourLabel(h)}
        </option>
      ))}
    </select>
  );
}

/** Scrollable list of contacts still queued to send (name · email · phone). */
export function CrmPendingList({ rows, count }: { rows: CrmPendingRow[]; count: number }) {
  if (count === 0) {
    return <p className="text-xs text-[var(--muted-foreground)]">No contacts pending.</p>;
  }
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium">Pending queue ({count})</p>
      <div className="max-h-56 overflow-auto rounded-md border">
        <table className="w-full text-xs">
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="px-2 py-1">{r.contactName ?? "—"}</td>
                <td className="px-2 py-1 text-[var(--muted-foreground)]">{r.contactEmail ?? "—"}</td>
                <td className="px-2 py-1 text-[var(--muted-foreground)]">{r.contactPhone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > rows.length ? (
        <p className="text-xs text-[var(--muted-foreground)]">Showing {rows.length} of {count}.</p>
      ) : null}
    </div>
  );
}

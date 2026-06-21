/** CSV helpers shared by the admin export routes. */

/** RFC 4180 quoting + CSV/formula-injection neutralization (=,+,-,@,tab,CR). */
export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = "";
  else if (typeof value === "boolean") s = value ? "Yes" : "No";
  else s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export interface CsvColumn<T> {
  key: keyof T;
  label: string;
}

/** Build a CSV string (with a UTF-8 BOM so Excel reads non-ASCII correctly). */
export function toCsv<T>(rows: T[], columns: CsvColumn<T>[]): string {
  const lines = [columns.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows) {
    lines.push(columns.map((c) => csvCell(r[c.key])).join(","));
  }
  return "﻿" + lines.join("\r\n");
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { formatIST } from "@/lib/date";
import { deleteSubmissions } from "@/features/admin/actions/submissions";
import { type ContactRow } from "@/features/admin/data/analytics";

const UTM = [
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "fbclid",
  "gclid",
] as const;

const tick = (v: boolean) => (v ? "✓" : "—");

/** Contacts table with row selection + delete (super-admin). Selection is over
 *  the rows currently shown (this page). */
export function ContactsTable({ rows }: { rows: ContactRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);

  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));

  const onDelete = () => {
    const ids = [...sel];
    if (!ids.length) return;
    if (
      !confirm(
        `Permanently delete ${ids.length} contact(s) and their results (answers, scores, AI messages)?\n\nThis cannot be undone.`,
      )
    )
      return;
    setMsg(null);
    start(async () => {
      const res = await deleteSubmissions(ids);
      if (!res.ok) {
        setMsg(res.error ?? "Delete failed.");
        return;
      }
      setSel(new Set());
      router.refresh();
    });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={pending || sel.size === 0}
          onClick={onDelete}
          className="border-red-500 text-red-600 hover:bg-red-500/10 disabled:opacity-40"
        >
          {pending ? "Deleting…" : `Delete selected${sel.size ? ` (${sel.size})` : ""}`}
        </Button>
        {msg ? <span className="text-sm text-red-500">{msg}</span> : null}
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-1.5">
                <input type="checkbox" checked={allSelected} onChange={toggleAll} aria-label="Select all" />
              </th>
              <th className="px-3 py-1.5">Contact</th>
              <th className="whitespace-nowrap px-3 py-1.5">Opt-in date (IST)</th>
              <th className="px-3 py-1.5 text-center">Opt-in</th>
              <th className="px-3 py-1.5 text-center">Completed</th>
              <th className="px-3 py-1.5 text-center">VSL</th>
              {UTM.map((u) => (
                <th key={u} className="whitespace-nowrap px-3 py-1.5">{u}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className={sel.has(r.id) ? "bg-red-500/5" : ""}>
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={sel.has(r.id)}
                    onChange={() => toggle(r.id)}
                    aria-label="Select contact"
                  />
                </td>
                <td className="px-3 py-2">
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {[r.firstName, r.lastName].filter(Boolean).join(" ") || "—"}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)]">{r.email ?? "—"}</span>
                    <span className="text-xs text-[var(--muted-foreground)]">{r.mobile ?? "—"}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  {formatIST(r.createdAt)}
                </td>
                <td className="px-3 py-2 text-center text-green-600">✓</td>
                <td className="px-3 py-2 text-center">{tick(r.completed)}</td>
                <td className="px-3 py-2 text-center">{tick(r.vslLoaded)}</td>
                {UTM.map((u) => (
                  <td key={u} className="whitespace-nowrap px-3 py-2 text-xs">
                    {r.attribution?.[u] ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

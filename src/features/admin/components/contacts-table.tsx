"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [query, setQuery] = useState("");

  // Live substring search: any contiguous run of the typed letters, anywhere in
  // name / email / phone / profession / customer id / token (case-insensitive).
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.firstName, r.lastName, r.email, r.mobile, r.profession, r.customerId, r.resultToken]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, query]);

  const allSelected = visible.length > 0 && visible.every((r) => sel.has(r.id));
  const toggle = (id: string) =>
    setSel((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const toggleAll = () =>
    setSel((s) => {
      if (allSelected) {
        // Deselect only the rows currently shown; keep any off-screen selections.
        const n = new Set(s);
        for (const r of visible) n.delete(r.id);
        return n;
      }
      const n = new Set(s);
      for (const r of visible) n.add(r.id);
      return n;
    });

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
      <Input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name, email, phone, profession, customer ID…"
        className="max-w-md"
        aria-label="Search contacts"
      />
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
        <span className="text-xs text-[var(--muted-foreground)]">
          {query ? `${visible.length} of ${rows.length}` : `${rows.length}`} shown
        </span>
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
              <th className="whitespace-nowrap px-3 py-1.5">Customer ID</th>
              <th className="whitespace-nowrap px-3 py-1.5">Result token (URL)</th>
              <th className="whitespace-nowrap px-3 py-1.5">Opt-in date (IST)</th>
              <th className="px-3 py-1.5 text-center">Opt-in</th>
              <th className="px-3 py-1.5 text-center">Completed</th>
              <th className="whitespace-nowrap px-3 py-1.5 text-center">Paid</th>
              <th className="px-3 py-1.5 text-center">VSL</th>
              {UTM.map((u) => (
                <th key={u} className="whitespace-nowrap px-3 py-1.5">{u}</th>
              ))}
              <th className="whitespace-nowrap px-3 py-1.5">fbclid_timestamp</th>
              <th className="whitespace-nowrap px-3 py-1.5">fbp</th>
              <th className="whitespace-nowrap px-3 py-1.5">client_ip</th>
              <th className="whitespace-nowrap px-3 py-1.5">user_agent</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visible.length === 0 ? (
              <tr>
                <td colSpan={13 + UTM.length} className="px-3 py-6 text-center text-sm text-[var(--muted-foreground)]">
                  No contacts match “{query}”.
                </td>
              </tr>
            ) : null}
            {visible.map((r) => (
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
                    <span className="text-xs text-[var(--muted-foreground)]">{r.profession ?? "—"}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.customerId ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs">{r.resultToken ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-[var(--muted-foreground)]">
                  {formatIST(r.createdAt)}
                </td>
                <td className="px-3 py-2 text-center text-green-600">✓</td>
                <td className="px-3 py-2 text-center">{tick(r.completed)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-center">
                  {r.paidAmount != null ? (
                    <div className="flex flex-col items-center">
                      <span className="font-medium text-green-600 tabular-nums">₹{r.paidAmount}</span>
                      {r.paidAt ? (
                        <span className="text-[10px] text-[var(--muted-foreground)]">{formatIST(r.paidAt)}</span>
                      ) : null}
                    </div>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="px-3 py-2 text-center tabular-nums">{r.vslLoads}</td>
                {UTM.map((u) => (
                  <td key={u} className="whitespace-nowrap px-3 py-2 text-xs">
                    {r.attribution?.[u] ?? "—"}
                  </td>
                ))}
                <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums">{r.fbclidTimestamp ?? "—"}</td>
                <td className="max-w-[160px] truncate px-3 py-2 text-xs" title={r.fbp ?? ""}>{r.fbp ?? "—"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{r.clientIp ?? "—"}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-xs" title={r.userAgent ?? ""}>{r.userAgent ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

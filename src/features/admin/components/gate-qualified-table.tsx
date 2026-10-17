"use client";

import { useMemo, useState } from "react";
import { formatIST } from "@/lib/date";
import { Input } from "@/components/ui/input";

/** One answered gate question, as it was resolved at the moment it was answered. */
export interface GateAnswerRow {
  q: string;
  a: string;
  points: number;
  max: number;
}

export interface GateQualifiedRow {
  id: string;
  /** The public customer id. The SAME id the submission carries once they register,
   *  which is how a lead and a submission are known to be one person. */
  customerId: string | null;
  name: string;
  email: string;
  /** Audience role, else the profession they picked. */
  role: string | null;
  /** When the email was submitted. This is the moment they became a lead. */
  capturedAt: string | null;
  gateScore: number | null;
  gateMax: number | null;
  gateBand: string | null;
  gateAnswers: GateAnswerRow[];
  /** Custom opt-in field answers, already resolved to their labels. */
  extras: { label: string; value: string }[];
  assessmentTitle: string;
  /** Set once they reached the phone screen and registered. */
  submissionId: string | null;
  completedAt: string | null;
  score: string | null;
  bandTitle: string | null;
  place: string | null;
}

function fmt(iso: string | null): string {
  return iso ? formatIST(iso) : "-";
}

/**
 * The leads a SPLIT funnel captured at the gate.
 *
 * WHAT THIS SCREEN IS FOR. In split mode the email arrives minutes before the
 * assessment is finished, and plenty of people never finish. Those are the rows that
 * used to not exist at all: somebody who qualified, handed over a name and an email,
 * and then abandoned twenty-one statements. They are worth a call, and until now the
 * funnel threw them away.
 *
 * 🔴 WHY IT IS A SEPARATE SCREEN. A lead here is NOT a submission, and the two must
 * never be added together. "Registered" is what Submissions counts and what
 * CompleteRegistration reports to Meta; this list is everybody who got as far as an
 * email, registered or not. Showing them in one table would silently inflate whichever
 * number the ad spend is being judged against.
 */
export function GateQualifiedTable({ rows }: { rows: GateQualifiedRow[] }) {
  const [q, setQ] = useState("");
  const [only, setOnly] = useState<"all" | "open" | "done">("all");
  const [open, setOpen] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (only === "open" && r.submissionId) return false;
      if (only === "done" && !r.submissionId) return false;
      if (!needle) return true;
      return (
        r.name.toLowerCase().includes(needle) ||
        r.email.toLowerCase().includes(needle) ||
        (r.customerId ?? "").toLowerCase().includes(needle) ||
        (r.role ?? "").toLowerCase().includes(needle)
      );
    });
  }, [rows, q, only]);

  const openCount = rows.filter((r) => !r.submissionId).length;

  if (rows.length === 0) {
    return (
      <div className="rounded-lg border p-6 text-sm text-[var(--muted-foreground)]">
        <p className="font-medium text-[var(--foreground)]">No gate-qualified leads yet.</p>
        <p className="pt-1">
          This list fills only for assessments set to <strong>Split across the funnel</strong> on
          the Lead capture step. In that mode the email is taken the moment somebody clears the
          gate, so anyone who abandons the assessment afterwards still appears here.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          className="h-9 max-w-xs"
          placeholder="Search name, email, customer id…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {(
          [
            ["all", `All (${rows.length})`],
            ["open", `Not finished (${openCount})`],
            ["done", `Registered (${rows.length - openCount})`],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setOnly(k)}
            className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
              only === k ? "border-green-600 bg-green-600/10" : "hover:bg-[var(--muted)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* The sentence that stops this screen being mistaken for the lead total. */}
      <p className="text-xs text-[var(--muted-foreground)]">
        Everyone here gave an email after passing the gate. The ones marked Registered also appear
        in Submissions, under the same customer id, so do not add the two lists together - paste a
        customer id into the Submissions search to find its row there.
      </p>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left text-xs text-[var(--muted-foreground)]">
            <tr>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Customer id</th>
              <th className="whitespace-nowrap px-3 py-2">Email captured</th>
              <th className="px-3 py-2">Gate</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Gate answers</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-t align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name || "(no name)"}</div>
                  <div className="text-xs text-[var(--muted-foreground)]">{r.email}</div>
                  {r.role ? (
                    <div className="text-xs text-[var(--muted-foreground)]">{r.role}</div>
                  ) : null}
                  {r.place ? (
                    <div className="text-xs text-[var(--muted-foreground)]">{r.place}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 font-mono text-xs">{r.customerId ?? "-"}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">{fmt(r.capturedAt)}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {r.gateMax && r.gateMax > 0 ? (
                    <span>
                      {r.gateScore ?? 0}/{r.gateMax}
                      {r.gateBand ? ` · ${r.gateBand}` : ""}
                    </span>
                  ) : (
                    <span className="text-[var(--muted-foreground)]">-</span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-xs">
                  {r.submissionId ? (
                    <div className="flex flex-col gap-0.5">
                      <span className="font-medium text-green-600">Registered</span>
                      <span className="text-[var(--muted-foreground)]">{fmt(r.completedAt)}</span>
                      {r.score ? <span>{r.score}</span> : null}
                      {r.bandTitle ? <span>{r.bandTitle}</span> : null}
                    </div>
                  ) : (
                    // Not a failure and not an abandonment verdict - just the honest
                    // state. The sweep decides abandonment on its own schedule.
                    <span className="font-medium text-amber-500">Not finished</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">
                  {r.gateAnswers.length === 0 && r.extras.length === 0 ? (
                    <span className="text-[var(--muted-foreground)]">-</span>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => setOpen(open === r.id ? null : r.id)}
                        className="underline"
                      >
                        {open === r.id ? "Hide" : `Show (${r.gateAnswers.length + r.extras.length})`}
                      </button>
                      {open === r.id ? (
                        <div className="mt-2 flex max-w-md flex-col gap-1">
                          {r.gateAnswers.map((a, i) => (
                            <div key={`g${i}`} className="rounded border p-2">
                              <div className="text-[var(--muted-foreground)]">{a.q}</div>
                              <div className="font-medium">
                                {a.a}
                                {a.max > 0 ? ` (${a.points}/${a.max})` : ""}
                              </div>
                            </div>
                          ))}
                          {r.extras.map((e, i) => (
                            <div key={`e${i}`} className="rounded border p-2">
                              <div className="text-[var(--muted-foreground)]">{e.label}</div>
                              <div className="font-medium">{e.value}</div>
                            </div>
                          ))}
                        </div>
                      ) : null}
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 ? (
        <p className="text-sm text-[var(--muted-foreground)]">Nothing matches that filter.</p>
      ) : null}
    </div>
  );
}
